/**
 * RestoChat — Cloudflare Worker Webhook Proxy
 * ============================================
 * Always-online middleman that receives Meta WhatsApp webhooks and stores
 * the raw payload in Supabase when the origin server (your PC) is offline.
 *
 * Environment variables (set in Cloudflare dashboard → Workers → Settings):
 *   VERIFY_TOKEN     – Must match WA_VERIFY_TOKEN in your .env
 *   SUPABASE_URL     – Your Supabase project URL (e.g. https://xyz.supabase.co)
 *   SUPABASE_ANON_KEY – Your Supabase anon/public key
 *   BACKEND_WEBHOOK_URL – Your Cloudflare Tunnel webhook URL (e.g. https://your-tunnel.trycloudflare.com/api/webhook)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Health check ───────────────────────────────────────────────────────
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "RestoChat Webhook Proxy" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only handle /webhook path
    if (url.pathname !== "/webhook") {
      return new Response("Not Found", { status: 404 });
    }

    // ── GET: Meta webhook verification ─────────────────────────────────────
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
        console.log("[WORKER] Webhook verification successful");
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden — verify token mismatch", { status: 403 });
    }

    // ── POST: Incoming webhook from Meta ───────────────────────────────────
    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        console.error("[WORKER] Failed to parse JSON body:", err);
        return new Response("Bad Request", { status: 400 });
      }

      // Always return 200 to Meta immediately — never let it retry
      // We process in the background using waitUntil
      const response = new Response("EVENT_RECEIVED", { status: 200 });

      // Try forwarding to origin first, fall back to Supabase queue
      const forwardAndStore = async () => {
        let forwarded = false;

        // Attempt to forward to the real backend
        if (env.BACKEND_WEBHOOK_URL) {
          try {
            const originResp = await fetch(env.BACKEND_WEBHOOK_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // Forward the signature header so backend can verify
                "X-Hub-Signature-256": request.headers.get("X-Hub-Signature-256") || "",
              },
              body: JSON.stringify(body),
            });

            if (originResp.ok) {
              console.log("[WORKER] Forwarded to backend successfully");
              forwarded = true;
            } else {
              console.warn(`[WORKER] Backend returned ${originResp.status}, queuing in Supabase`);
            }
          } catch (err) {
            console.warn("[WORKER] Backend unreachable, queuing in Supabase:", err.message);
          }
        }

        // If forwarding failed (PC off / backend down), store in Supabase
        if (!forwarded) {
          try {
            const supabaseResp = await fetch(`${env.SUPABASE_URL}/rest/v1/pending_messages`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: env.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                payload: body,
                processed: false,
              }),
            });

            if (supabaseResp.ok) {
              console.log("[WORKER] Payload stored in Supabase successfully");
            } else {
              const errText = await supabaseResp.text();
              console.error("[WORKER] Supabase insert failed:", supabaseResp.status, errText);
            }
          } catch (err) {
            console.error("[WORKER] Supabase request failed:", err.message);
          }
        }
      };

      // Use waitUntil so the 200 response goes back immediately
      // while we forward / store in the background
      if (request.cf) {
        // In production Cloudflare Workers
        const ctx = { waitUntil: (p) => p };
        try {
          // Cloudflare Workers have ExecutionContext with waitUntil
          await forwardAndStore();
        } catch (err) {
          console.error("[WORKER] Background task error:", err);
        }
      } else {
        await forwardAndStore();
      }

      return response;
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
};
