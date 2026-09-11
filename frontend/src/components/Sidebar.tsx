'use client';

import Link from 'next/link';
import appLogo from '../../public/icon-512x512.png';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useBranding } from '@/lib/hooks/useBranding';
import { useUserChannels } from '@/lib/hooks/useUserChannels';
import { UpgradePlanModal } from './UpgradePlanModal';
import toast from 'react-hot-toast';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  CalendarDays,
  Zap,
  BookOpen,
  Megaphone,
  BarChart3,
  Settings,
  LogOut,
  HelpCircle,
  MessageCircle,
  Wifi,
  WifiOff,
  Loader2,
  Image,
  Star,
  Layers,
  Lock,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

const whatsappMenuItems = [
  { href: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/inbox',              icon: MessageSquare,   label: 'Inbox' },
  { href: '/chatbot',            icon: MessageCircle,   label: 'Chatbot' },
  { href: '/customers',          icon: Users,           label: 'Customers' },
  { href: '/customers/segments', icon: Layers,          label: 'Customer Segments' },
  { href: '/menu',               icon: BookOpen,        label: 'Catalogs & Price Lists' },
  { href: '/templates',          icon: MessageCircle,   label: 'Templates' },
  { href: '/quick-replies',      icon: Zap,             label: 'Quick Replies' },
  { href: '/broadcasts',         icon: Megaphone,       label: 'Broadcasts' },
  { href: '/reservations',       icon: CalendarDays,    label: 'Leads & Enquiries' },
  { href: '/media',              icon: Image,           label: 'Media' },
  { href: '/reports',            icon: BarChart3,       label: 'Reports' },
];

const gbpMenuItems = [
  { href: '/reviews',            icon: Star,            label: 'Google Reviews' },
  { href: '/reservations',       icon: CalendarDays,    label: 'Storefront Leads' },
  { href: '/reports',            icon: BarChart3,       label: 'Local Maps Insights' },
];

const generalItems = [
  { href: '/settings', icon: Settings, label: 'Settings' },
];

type WaStatus = 'checking' | 'connected' | 'disconnected';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth } = useAuthStore();
  const { data: BRANDING } = useBranding();
  const { user, enabledChannels, isWhatsAppEnabled, isGbpEnabled } = useUserChannels();

  const [waStatus, setWaStatus] = useState<WaStatus>('checking');
  const [googleConnected, setGoogleConnected] = useState<boolean>(false);
  const [activeSuite, setActiveSuite] = useState<'whatsapp' | 'gbp'>('whatsapp');
  const [upgradeModalOpen, setUpgradeModalOpen] = useState<boolean>(false);
  const [targetUpgradeSuite, setTargetUpgradeSuite] = useState<'whatsapp' | 'gbp'>('gbp');

  // Sync active suite based on URL path and available entitlements
  useEffect(() => {
    const savedSuite = typeof window !== 'undefined' ? localStorage.getItem('active_suite') as 'whatsapp' | 'gbp' : null;
    if (pathname.startsWith('/reviews')) {
      setActiveSuite('gbp');
    } else if (savedSuite === 'gbp' && isGbpEnabled) {
      setActiveSuite('gbp');
    } else if (isWhatsAppEnabled) {
      setActiveSuite('whatsapp');
    } else if (isGbpEnabled) {
      setActiveSuite('gbp');
    }
  }, [pathname, isWhatsAppEnabled, isGbpEnabled]);

  // Check WhatsApp connection status
  useEffect(() => {
    const checkWa = async () => {
      try {
        await api.post('/api/settings/test-connection');
        setWaStatus('connected');
      } catch {
        setWaStatus('disconnected');
      }
    };

    checkWa();
    const interval = setInterval(checkWa, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Check Google connection status
  useEffect(() => {
    const checkGbp = async () => {
      try {
        const res = await api.get('/api/gmb/locations');
        setGoogleConnected((res.data?.locations?.length || 0) > 0);
      } catch {
        setGoogleConnected(false);
      }
    };

    if (isGbpEnabled) {
      checkGbp();
    }
  }, [isGbpEnabled]);

  const handleSwitchSuite = (suite: 'whatsapp' | 'gbp') => {
    if (suite === 'whatsapp' && !isWhatsAppEnabled) {
      setTargetUpgradeSuite('whatsapp');
      setUpgradeModalOpen(true);
      return;
    }
    if (suite === 'gbp' && !isGbpEnabled) {
      setTargetUpgradeSuite('gbp');
      setUpgradeModalOpen(true);
      return;
    }

    setActiveSuite(suite);
    if (typeof window !== 'undefined') {
      localStorage.setItem('active_suite', suite);
    }

    if (suite === 'gbp' && !pathname.startsWith('/reviews') && !pathname.startsWith('/reservations') && !pathname.startsWith('/reports')) {
      router.push('/reviews');
    } else if (suite === 'whatsapp' && pathname.startsWith('/reviews')) {
      router.push('/dashboard');
    }
  };

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

  const currentMenuItems = activeSuite === 'gbp' ? gbpMenuItems : whatsappMenuItems;

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
        {/* ── Brand Logo & App Name ── */}
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #f3f4f6' }}>
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
                {BRANDING?.appName || 'Black Angler'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {activeSuite === 'gbp' ? 'Google Suite' : 'WhatsApp Suite'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Pattern A: Modular Workspace Suite Switcher ── */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{
            display: 'flex',
            background: '#F1F5F9',
            borderRadius: '10px',
            padding: '3px',
            gap: '3px'
          }}>
            <button
              type="button"
              onClick={() => handleSwitchSuite('whatsapp')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '7px 8px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '11px',
                fontWeight: activeSuite === 'whatsapp' ? '700' : '500',
                background: activeSuite === 'whatsapp' ? '#FFFFFF' : 'transparent',
                color: activeSuite === 'whatsapp' ? '#166534' : '#64748B',
                boxShadow: activeSuite === 'whatsapp' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <MessageCircle size={13} color={isWhatsAppEnabled ? '#16A34A' : '#94A3B8'} />
              <span>WhatsApp</span>
              {!isWhatsAppEnabled && <Lock size={10} color="#DC2626" />}
            </button>

            <button
              type="button"
              onClick={() => handleSwitchSuite('gbp')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '7px 8px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '11px',
                fontWeight: activeSuite === 'gbp' ? '700' : '500',
                background: activeSuite === 'gbp' ? '#FFFFFF' : 'transparent',
                color: activeSuite === 'gbp' ? '#1D4ED8' : '#64748B',
                boxShadow: activeSuite === 'gbp' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Star size={13} color={isGbpEnabled ? '#F59E0B' : '#94A3B8'} fill={isGbpEnabled ? '#F59E0B' : 'transparent'} />
              <span>Google GBP</span>
              {!isGbpEnabled && <Lock size={10} color="#DC2626" />}
            </button>
          </div>
        </div>

        {/* ── Contextual Connection Status Indicator ── */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {activeSuite === 'whatsapp' ? (
            <>
              <div
                className={statusConfig[waStatus].dotClass}
                style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }}
              />
              <span style={{ color: statusConfig[waStatus].color, fontSize: '12px', fontWeight: '500' }}>
                {statusConfig[waStatus].text}
              </span>
              {waStatus === 'checking' && (
                <Loader2 size={12} style={{ color: '#F59E0B', animation: 'spin 1s linear infinite', marginLeft: 'auto' }} />
              )}
              {waStatus === 'disconnected' && (
                <span
                  title="Configure WhatsApp in Settings"
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
            </>
          ) : (
            <>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: googleConnected ? '#22C55E' : '#F59E0B',
                  flexShrink: 0
                }}
              />
              <span style={{ color: googleConnected ? '#059669' : '#D97706', fontSize: '12px', fontWeight: '500' }}>
                {googleConnected ? 'Google Profile Connected' : 'Google Not Connected'}
              </span>
              {googleConnected ? (
                <CheckCircle2 size={14} color="#059669" style={{ marginLeft: 'auto' }} />
              ) : (
                <Link href="/reviews" style={{ marginLeft: 'auto', fontSize: '11px', color: '#2563EB', fontWeight: '600' }}>
                  Connect
                </Link>
              )}
            </>
          )}
        </div>

        {/* ── Active Suite Menu Items ── */}
        <div className="sidebar-section-label">
          {activeSuite === 'gbp' ? 'Google Business Tools' : 'WhatsApp Operations'}
        </div>
        <nav style={{ flex: 1 }}>
          {currentMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
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

          {/* Upsell banner if unentitled suite exists */}
          {activeSuite === 'whatsapp' && !isGbpEnabled && (
            <div
              onClick={() => {
                setTargetUpgradeSuite('gbp');
                setUpgradeModalOpen(true);
              }}
              style={{
                margin: '12px 14px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                border: '1px solid #BFDBFE',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#1E40AF', marginBottom: '2px' }}>
                <Star size={13} fill="#F59E0B" color="#F59E0B" /> Google Reviews AI
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#3B82F6' }}>
                Unlock Google Suite & AI reviews booster 🔒
              </p>
            </div>
          )}

          {activeSuite === 'gbp' && !isWhatsAppEnabled && (
            <div
              onClick={() => {
                setTargetUpgradeSuite('whatsapp');
                setUpgradeModalOpen(true);
              }}
              style={{
                margin: '12px 14px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)',
                border: '1px solid #86EFAC',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#14532D', marginBottom: '2px' }}>
                <MessageCircle size={13} color="#16A34A" /> WhatsApp Marketing
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#15803D' }}>
                Unlock Meta Cloud broadcast campaigns 🔒
              </p>
            </div>
          )}
        </nav>

        {/* ── General section ── */}
        <div className="sidebar-section-label">General</div>
        <div>
          {generalItems.map((item) => {
            const Icon = item.icon;
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

          {user?.role === 'superadmin' && (
            <Link
              href="/superadmin"
              className={`sidebar-link ${pathname.startsWith('/superadmin') ? 'active' : ''}`}
            >
              <span className="sidebar-icon"><Settings size={18} color="#DC2626" /></span>
              <span style={{ color: '#DC2626', fontWeight: '600' }}>Superadmin</span>
            </Link>
          )}

          {(user?.role === 'agency_owner' || user?.agencyId) && (
            <Link
              href="/agency"
              className={`sidebar-link ${pathname.startsWith('/agency') ? 'active' : ''}`}
            >
              <span className="sidebar-icon"><Users size={18} color="#7C3AED" /></span>
              <span style={{ color: '#7C3AED', fontWeight: '600' }}>Agency Portal</span>
            </Link>
          )}

          <button
            className="sidebar-link"
            onClick={() =>
              window.open(
                `https://wa.me/918625067058?text=${encodeURIComponent('Hello! I need assistance with BlackAngler Platform.')}`,
                '_blank'
              )
            }
            style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
          >
            <span className="sidebar-icon"><HelpCircle size={18} /></span>
            <span>Help & Support</span>
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

      <UpgradePlanModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        targetSuite={targetUpgradeSuite}
      />
    </>
  );
}
