/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              RESTOCHAT — CLIENT BRANDING CONFIG                  ║
 * ║                                                                  ║
 * ║  Edit this file to customize the app for each client.           ║
 * ║  No other code changes needed — everything reads from here.     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * HOW TO USE:
 *  1. Logo Image  → Place your logo file in /public/branding/logo.png
 *                   (supports .png .jpg .svg .webp)
 *  2. Login Image → Place your background image in /public/branding/login-bg.jpg
 *                   (recommended: landscape photo, min 1200×800px)
 *  3. Edit the values below, then rebuild: docker-compose up -d --build
 */

export const BRANDING = {
  // ── App Identity ────────────────────────────────────────────────────────────
  /** Displayed in the sidebar, login page, browser tab, and PWA title */
  appName: 'RestoChat',

  /** Short tagline shown under the app name on the login page */
  tagline: 'WhatsApp Marketing Solution',

  // ── Logo ────────────────────────────────────────────────────────────────────
  /**
   * Logo image path (relative to /public).
   * Place your file at:  frontend/public/branding/logo.png
   * Then set:            logoPath: '/branding/logo.png'
   *
   * If logoPath is null the app will use the default emoji icon (💬).
   */
  logoPath: null as string | null,

  /** Fallback emoji icon shown when no logo image is provided */
  logoEmoji: '💬',

  /** Alt text for the logo image */
  logoAlt: 'Restaurant Logo',

  // ── Login Page ───────────────────────────────────────────────────────────────
  /**
   * Left-panel background image on the login page.
   * Place your file at:  frontend/public/branding/login-bg.jpg
   * Then set:            loginBgPath: '/branding/login-bg.jpg'
   *
   * If null, falls back to the default Unsplash restaurant photo.
   */
  loginBgPath: null as string | null,

  /** Alt text for the login background image */
  loginBgAlt: 'Restaurant',

  // ── Brand Colors ─────────────────────────────────────────────────────────────
  /**
   * Primary brand color used for the sidebar, buttons, active states, etc.
   * Use any valid CSS color value (hex, hsl, rgb).
   * Default: dark forest green — '#1B5E37'
   */
  primaryColor: '#1B5E37',

  /** Slightly lighter accent shade (used in gradients, hover states) */
  accentColor: '#2E7D4F',

  /** Very dark variant used in the splash screen background gradient */
  darkColor: '#0d2b1a',

  // ── Login Page Content ───────────────────────────────────────────────────────
  /** Rotating bullet points shown on the login hero panel */
  impactLines: [
    'Automate customer engagement via WhatsApp',
    'Increase repeat orders by 40% with targeted broadcasts',
    'Manage reservations and orders in real-time',
    'Reduce response time to under 2 minutes',
    'Drive revenue with personalized marketing campaigns',
    'Track performance with powerful analytics dashboards',
    'Streamline operations with smart automation workflows',
    'Build lasting customer relationships at scale',
  ],

  /** Stats shown at the bottom of the login hero panel */
  trustStats: [
    { number: '10K+',  label: 'Messages / Day' },
    { number: '500+',  label: 'Businesses' },
    { number: '99.9%', label: 'Uptime' },
  ],
} as const;
