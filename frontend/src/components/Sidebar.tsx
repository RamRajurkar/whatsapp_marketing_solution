'use client';

import Link from 'next/link';
import appLogo from '../../public/icon-512x512.png';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useBranding } from '@/lib/hooks/useBranding';
import toast from 'react-hot-toast';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  CalendarDays,
  Zap,
  UtensilsCrossed,
  Megaphone,
  BarChart3,
  Settings,
  LogOut,
  HelpCircle,
  MessageCircle,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';

const menuItems = [
  { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/inbox',         icon: MessageSquare,   label: 'Inbox' },
  { href: '/customers',     icon: Users,           label: 'Customers' },
  { href: '/reservations',  icon: CalendarDays,    label: 'Reservations' },
  { href: '/quick-replies', icon: Zap,             label: 'Quick Replies' },
  { href: '/menu',          icon: UtensilsCrossed, label: 'Menu' },
  { href: '/templates',     icon: MessageCircle,   label: 'Templates' },
  { href: '/broadcasts',    icon: Megaphone,       label: 'Broadcasts' },
  { href: '/reports',       icon: BarChart3,       label: 'Reports' },
];

const generalItems = [
  { href: '/settings', icon: Settings, label: 'Settings' },
];

type WaStatus = 'checking' | 'connected' | 'disconnected';

export function Sidebar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const { clearAuth } = useAuthStore();
  const { data: BRANDING } = useBranding();
  const [waStatus, setWaStatus] = useState<WaStatus>('checking');

  // Check WhatsApp connection status on mount (and every 2 minutes)
  useEffect(() => {
    const check = async () => {
      try {
        await api.post('/api/settings/test-connection');
        setWaStatus('connected');
      } catch {
        setWaStatus('disconnected');
      }
    };

    check();
    const interval = setInterval(check, 2 * 60 * 1000); // re-check every 2 min
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('wa_token');
    clearAuth();
    toast.success('Logged out successfully');
    window.location.href = '/login';
  };

  const statusConfig: Record<WaStatus, { color: string; text: string; dotClass: string }> = {
    checking:     { color: '#F59E0B', text: 'Checking...',          dotClass: 'dot-checking' },
    connected:    { color: '#22C55E', text: 'WhatsApp Connected',   dotClass: 'dot-connected' },
    disconnected: { color: '#EF4444', text: 'WhatsApp Disconnected', dotClass: 'dot-disconnected' },
  };

  const { color, text, dotClass } = statusConfig[waStatus];

  return (
    <>
      <style>{`
        .dot-connected    { background: #22C55E; animation: pulse-dot 2s infinite; }
        .dot-checking     { background: #F59E0B; animation: pulse-dot 1s infinite; }
        .dot-disconnected { background: #EF4444; }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.35); opacity: 0.65; }
        }
      `}</style>

      <div className="sidebar">
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: BRANDING ? `linear-gradient(135deg, ${BRANDING.primaryColor}, ${BRANDING.accentColor})` : '#1B5E37',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: BRANDING ? `0 4px 12px ${BRANDING.primaryColor}4D` : 'none',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <img
                src={appLogo.src}
                alt="App Logo"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div>
              <div style={{ color: '#1a1a2e', fontWeight: '800', fontSize: '17px', letterSpacing: '-0.3px' }}>
                {BRANDING?.appName || 'RestoChat'}
              </div>
            </div>
          </div>
        </div>

        {/* ── WhatsApp status (dynamic) ── */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <div
            className={dotClass}
            style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }}
          />
          <span style={{ color, fontSize: '12px', fontWeight: '500' }}>{text}</span>
          {waStatus === 'checking' && (
            <Loader2 size={12} style={{ color: '#F59E0B', animation: 'spin 1s linear infinite', marginLeft: 'auto' }} />
          )}
          {waStatus === 'disconnected' && (
            <span
              title="Go to Settings to fix connection"
              style={{ marginLeft: 'auto', cursor: 'pointer', color: '#EF4444' }}
              onClick={() => router.push('/settings')}
            >
              <WifiOff size={14} />
            </span>
          )}
          {waStatus === 'connected' && (
            <span style={{ marginLeft: 'auto', color: '#22C55E' }}>
              <Wifi size={14} />
            </span>
          )}
        </div>

        {/* ── Menu section ── */}
        <div className="sidebar-section-label">Menu</div>
        <nav style={{ flex: 1 }}>
          {menuItems.map((item) => {
            const Icon     = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-icon"><Icon size={18} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── General section ── */}
        <div className="sidebar-section-label">General</div>
        <div>
          {generalItems.map((item) => {
            const Icon     = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-icon"><Icon size={18} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            className="sidebar-link"
            onClick={() =>
              window.open(
                `https://wa.me/917447875452?text=${encodeURIComponent('Hello! I need some help regarding the RestoChat system.')}`,
                '_blank'
              )
            }
            style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
          >
            <span className="sidebar-icon"><HelpCircle size={18} /></span>
            <span>Help</span>
          </button>

          <button
            className="sidebar-link"
            onClick={handleLogout}
            style={{
              width: '100%', border: 'none', background: 'none', textAlign: 'left',
              fontFamily: 'Inter, sans-serif', color: '#B91C1C',
            }}
          >
            <span className="sidebar-icon"><LogOut size={18} /></span>
            <span>Logout</span>
          </button>
        </div>

        <div style={{ height: '16px' }} />
      </div>
    </>
  );
}
