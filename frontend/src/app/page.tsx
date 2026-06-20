'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { BRANDING } from '@/lib/branding.config';

type Stage = 'checking' | 'ready' | 'error';
type ServiceStatus = 'waiting' | 'ok' | 'error';

interface HealthData {
  status: string;
  db: string;
}

interface ServiceState {
  backend: ServiceStatus;
  mongodb: ServiceStatus;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const MAX_RETRIES = 25;       // 25 × 2 s = 50 s total wait
const RETRY_INTERVAL_MS = 2000;

export default function SplashPage() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [stage, setStage]       = useState<Stage>('checking');
  const [services, setServices] = useState<ServiceState>({ backend: 'waiting', mongodb: 'waiting' });
  const [attempt, setAttempt]   = useState(0);
  const [dots, setDots]         = useState('');
  const cancelled               = useRef(false);

  // ── Animate loading dots ────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 450);
    return () => clearInterval(id);
  }, []);

  // ── Poll /api/health until backend + MongoDB are both up ────────────────────
  useEffect(() => {
    cancelled.current = false;

    const checkHealth = async () => {
      for (let i = 0; i < MAX_RETRIES; i++) {
        if (cancelled.current) return;
        setAttempt(i + 1);

        try {
          const res = await fetch(`${API_URL}/api/health`, {
            signal: AbortSignal.timeout(3000),
          });

          // Backend responded — mark it green
          setServices((prev) => ({ ...prev, backend: 'ok' }));

          if (res.ok) {
            const data: HealthData = await res.json();

            // Reflect MongoDB status from health response
            const dbOk = data.db === 'ok';
            setServices({ backend: 'ok', mongodb: dbOk ? 'ok' : 'error' });

            if (dbOk) {
              // Both services up — launch the app
              if (cancelled.current) return;
              setStage('ready');
              setTimeout(() => {
                if (!cancelled.current) {
                  router.replace(token ? '/dashboard' : '/login');
                }
              }, 900);
              return;
            }
            // Backend up but DB not ready yet — keep retrying
          }
        } catch {
          // Backend not reachable yet
          setServices({ backend: 'waiting', mongodb: 'waiting' });
        }

        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
      }

      // Timed out
      if (!cancelled.current) {
        setStage('error');
        // Mark whichever service is still waiting as error
        setServices((prev) => ({
          backend: prev.backend === 'waiting' ? 'error' : prev.backend,
          mongodb: prev.mongodb === 'waiting' ? 'error' : prev.mongodb,
        }));
      }
    };

    checkHealth();
    return () => { cancelled.current = true; };
  }, [router, token]);

  const handleRetry = () => window.location.reload();

  const progressPct = Math.min((attempt / MAX_RETRIES) * 100, 95);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .splash-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(145deg, ${BRANDING.darkColor} 0%, ${BRANDING.primaryColor} 55%, ${BRANDING.accentColor} 100%);
          font-family: 'Inter', sans-serif;
          color: white;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        /* Decorative blobs */
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.12;
          pointer-events: none;
        }
        .blob-1 { width: 420px; height: 420px; background: #25D366; top: -120px; right: -100px; }
        .blob-2 { width: 320px; height: 320px; background: #128C7E; bottom: -90px; left: -90px; }

        .card {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 400px;
        }

        /* Logo */
        .logo-ring {
          width: 96px;
          height: 96px;
          border-radius: 28px;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.22);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          margin-bottom: 22px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          backdrop-filter: blur(8px);
        }

        .app-name    { font-size: 34px; font-weight: 800; letter-spacing: -0.8px; margin-bottom: 6px; }
        .app-tagline { font-size: 13px; color: rgba(255,255,255,0.55); margin-bottom: 40px; }

        /* ── Service status panel ── */
        .services-panel {
          width: 100%;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px;
          padding: 20px 24px;
          margin-bottom: 24px;
          backdrop-filter: blur(8px);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .service-row {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .service-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .service-icon.backend { background: rgba(59,130,246,0.25); }
        .service-icon.mongodb { background: rgba(34,197,94,0.2); }

        .service-info { flex: 1; }
        .service-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); }
        .service-sub  { font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 1px; }

        /* Status dot */
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-dot.waiting { background: rgba(255,255,255,0.3); }
        .status-dot.ok      { background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,0.6); animation: glow 1.5s ease infinite; }
        .status-dot.error   { background: #EF4444; box-shadow: 0 0 8px rgba(239,68,68,0.6); }

        @keyframes glow {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }

        /* Status label */
        .status-label {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 9px;
          border-radius: 20px;
          flex-shrink: 0;
        }
        .status-label.waiting { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); }
        .status-label.ok      { background: rgba(34,197,94,0.2);   color: #86EFAC; }
        .status-label.error   { background: rgba(239,68,68,0.2);   color: #FCA5A5; }

        /* Mini spinner for waiting items */
        @keyframes spin { to { transform: rotate(360deg); } }
        .mini-spin {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: rgba(255,255,255,0.7);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }

        /* Divider between service rows */
        .service-divider {
          height: 1px;
          background: rgba(255,255,255,0.07);
          margin: 0 -4px;
        }

        /* Progress bar */
        .progress-wrap {
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.12);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 14px;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.9));
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        .status-text {
          font-size: 13px;
          color: rgba(255,255,255,0.6);
          text-align: center;
          min-height: 18px;
        }

        /* Ready state */
        @keyframes pop { 0%{transform:scale(0.7);opacity:0} 80%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
        .ready-icon  { font-size: 44px; animation: pop 0.4s ease forwards; margin-bottom: 14px; }
        .ready-text  { font-size: 17px; font-weight: 700; color: #86EFAC; }

        /* Error state */
        .error-box   { text-align: center; width: 100%; }
        .error-title { font-size: 18px; font-weight: 700; color: #FCA5A5; margin-bottom: 8px; }
        .error-sub   { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 24px; line-height: 1.6; }
        .retry-btn {
          padding: 12px 36px;
          background: white;
          color: #1B5E37;
          border: none;
          border-radius: 12px;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          font-family: 'Inter', sans-serif;
        }
        .retry-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }

        .version {
          position: absolute;
          bottom: 24px;
          font-size: 11px;
          color: rgba(255,255,255,0.25);
          z-index: 1;
          letter-spacing: 0.04em;
        }
      `}</style>

      <div className="splash-root">
        <div className="blob blob-1" />
        <div className="blob blob-2" />

        <div className="card">
          {/* Logo & title */}
          <div className="logo-ring">
            {BRANDING.logoPath ? (
              <img
                src={BRANDING.logoPath}
                alt={BRANDING.logoAlt}
                style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '12px' }}
              />
            ) : (
              <span>{BRANDING.logoEmoji}</span>
            )}
          </div>
          <div className="app-name">{BRANDING.appName}</div>
          <div className="app-tagline">{BRANDING.tagline}</div>

          {/* ── Service status panel ── */}
          {(stage === 'checking' || stage === 'error') && (
            <div className="services-panel">
              <ServiceRow
                icon="⚡"
                iconClass="backend"
                name="Backend Server"
                sub="FastAPI · Port 5000"
                status={services.backend}
              />
              <div className="service-divider" />
              <ServiceRow
                icon="🍃"
                iconClass="mongodb"
                name="MongoDB Database"
                sub="Motor · Local Instance"
                status={services.mongodb}
              />
            </div>
          )}

          {/* Checking state */}
          {stage === 'checking' && (
            <>
              <div className="progress-wrap">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="status-text">Starting services{dots}</div>
            </>
          )}

          {/* Ready state */}
          {stage === 'ready' && (
            <>
              <div className="ready-icon">✅</div>
              <div className="ready-text">All systems ready! Launching…</div>
            </>
          )}

          {/* Error state */}
          {stage === 'error' && (
            <div className="error-box">
              <div className="error-title">Startup Failed</div>
              <div className="error-sub">
                {services.backend === 'error'
                  ? 'Docker containers are not running.\nOpen Docker Desktop and start the containers.'
                  : 'MongoDB is not responding.\nCheck if the mongo container is healthy.'}
              </div>
              <button className="retry-btn" onClick={handleRetry}>
                🔄 Retry
              </button>
            </div>
          )}
        </div>

        <div className="version">RestoChat v1.0</div>
      </div>
    </>
  );
}

// ── Service Row Component ───────────────────────────────────────────────────
function ServiceRow({
  icon,
  iconClass,
  name,
  sub,
  status,
}: {
  icon: string;
  iconClass: string;
  name: string;
  sub: string;
  status: ServiceStatus;
}) {
  const labelMap: Record<ServiceStatus, string> = {
    waiting: 'Starting…',
    ok:      'Running',
    error:   'Failed',
  };

  return (
    <div className="service-row">
      <div className={`service-icon ${iconClass}`}>{icon}</div>
      <div className="service-info">
        <div className="service-name">{name}</div>
        <div className="service-sub">{sub}</div>
      </div>
      {/* Spinner while waiting, dot when resolved */}
      {status === 'waiting' ? (
        <div className="mini-spin" />
      ) : (
        <div className={`status-dot ${status}`} />
      )}
      <div className={`status-label ${status}`}>{labelMap[status]}</div>
    </div>
  );
}
