'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
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
} from 'lucide-react';

const menuItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/inbox', icon: MessageSquare, label: 'Inbox' },
  { href: '/customers', icon: Users, label: 'Customers' },
  { href: '/reservations', icon: CalendarDays, label: 'Reservations' },
  { href: '/quick-replies', icon: Zap, label: 'Quick Replies' },
  { href: '/menu', icon: UtensilsCrossed, label: 'Menu' },
  { href: '/broadcasts', icon: Megaphone, label: 'Broadcasts' },
  { href: '/reports', icon: BarChart3, label: 'Reports' },
];

const generalItems = [
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth } = useAuthStore();

  const handleLogout = () => {
    localStorage.removeItem('wa_token');
    clearAuth();
    toast.success('Logged out successfully');
    router.push('/login');
  };

  return (
    <div className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #1B5E37, #2E7D4F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(27, 94, 55, 0.3)',
          }}>
            <MessageCircle size={20} color="white" />
          </div>
          <div>
            <div style={{ color: '#1a1a2e', fontWeight: '800', fontSize: '17px', letterSpacing: '-0.3px' }}>
              RestoChat
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp status */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <div className="online-dot" />
        <span style={{ color: '#22C55E', fontSize: '12px', fontWeight: '500' }}>WhatsApp Connected</span>
      </div>

      {/* Menu section */}
      <div className="sidebar-section-label">Menu</div>
      <nav style={{ flex: 1 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-icon">
                <Icon size={18} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* General section */}
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
              <span className="sidebar-icon">
                <Icon size={18} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          className="sidebar-link"
          onClick={() => window.open('https://github.com/Business-Projects-Prathamesh/whatsapp_marketing_solution', '_blank')}
          style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
        >
          <span className="sidebar-icon">
            <HelpCircle size={18} />
          </span>
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
          <span className="sidebar-icon">
            <LogOut size={18} />
          </span>
          <span>Logout</span>
        </button>
      </div>

      <div style={{ height: '16px' }} />
    </div>
  );
}
