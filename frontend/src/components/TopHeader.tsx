'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Trash2, CalendarDays, MessageSquare, Users, X, Volume2, Sparkles, CheckCheck } from 'lucide-react';
import { useAuthStore } from '@/lib/store/authStore';
import { getSocket } from '@/lib/socket';

export interface NotificationItem {
  id: string;
  type: 'lead' | 'message' | 'conversation';
  title: string;
  desc: string;
  timestamp: string;
  read: boolean;
  link: string;
}

export function playNotificationChime() {
  try {
    const soundEnabled = localStorage.getItem('notificationSoundEnabled') !== 'false';
    if (!soundEnabled) return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const now = ctx.currentTime;
    
    // Note 1: 659.25 Hz (E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Note 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.5);
  } catch (e) {
    console.error('Audio playback error:', e);
  }
}

export function TopHeader() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load notifications from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('app_notifications');
      if (saved) {
        setNotifications(JSON.parse(saved));
      } else {
        // Initial sample notification
        const initial = [
          {
            id: 'init_1',
            type: 'lead' as const,
            title: 'Welcome to Leads Notification',
            desc: 'New WhatsApp inquiries and lead alerts will appear here in real time.',
            timestamp: new Date().toISOString(),
            read: false,
            link: '/reservations'
          }
        ];
        setNotifications(initial);
        localStorage.setItem('app_notifications', JSON.stringify(initial));
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  }, []);

  // Save notifications to localStorage on update
  const saveNotifications = (newList: NotificationItem[]) => {
    setNotifications(newList);
    try {
      localStorage.setItem('app_notifications', JSON.stringify(newList));
    } catch (e) {
      console.error('Failed to save notifications:', e);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time Socket.IO Listeners
  useEffect(() => {
    const socket = getSocket();

    const handleNewLead = (lead: any) => {
      const newItem: NotificationItem = {
        id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        type: 'lead',
        title: `⚡ New B2B Lead: ${lead.productName || 'Wholesale Inquiry'}`,
        desc: `${lead.customerName || lead.customerPhone || lead.phone || 'Buyer'} requested ${lead.quantityRange || 'bulk quantity'}`,
        timestamp: new Date().toISOString(),
        read: false,
        link: '/reservations'
      };
      playNotificationChime();
      setNotifications(prev => {
        const updated = [newItem, ...prev].slice(0, 50);
        try { localStorage.setItem('app_notifications', JSON.stringify(updated)); } catch {}
        return updated;
      });
    };

    const handleNewMessage = (msg: any) => {
      if (msg.direction === 'outbound') return; // Ignore self messages
      const newItem: NotificationItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        type: 'message',
        title: `Message from ${msg.customerName || msg.customerPhone || 'Customer'}`,
        desc: msg.content?.text || msg.text || 'Received a WhatsApp message',
        timestamp: new Date().toISOString(),
        read: false,
        link: '/inbox'
      };
      playNotificationChime();
      setNotifications(prev => {
        const updated = [newItem, ...prev].slice(0, 50);
        try { localStorage.setItem('app_notifications', JSON.stringify(updated)); } catch {}
        return updated;
      });
    };

    const handleNewConv = (conv: any) => {
      const newItem: NotificationItem = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        type: 'conversation',
        title: `New Chat Started`,
        desc: `Customer ${conv.customerName || conv.customerPhone} started a chat`,
        timestamp: new Date().toISOString(),
        read: false,
        link: '/inbox'
      };
      playNotificationChime();
      setNotifications(prev => {
        const updated = [newItem, ...prev].slice(0, 50);
        try { localStorage.setItem('app_notifications', JSON.stringify(updated)); } catch {}
        return updated;
      });
    };

    socket.on('reservation:new', handleNewLead);
    socket.on('message:new', handleNewMessage);
    socket.on('conversation:new', handleNewConv);

    return () => {
      socket.off('reservation:new', handleNewLead);
      socket.off('message:new', handleNewMessage);
      socket.off('conversation:new', handleNewConv);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    saveNotifications(updated);
  };

  const deleteNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = notifications.filter(n => n.id !== id);
    saveNotifications(updated);
  };

  const clearAll = () => {
    saveNotifications([]);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    const updated = notifications.map(n => n.id === item.id ? { ...n, read: true } : n);
    saveNotifications(updated);
    setShowDropdown(false);
    router.push(item.link);
  };

  const getTimeAgo = (ts: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return '';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'lead':
        return <CalendarDays size={16} style={{ color: '#2563EB' }} />;
      case 'message':
        return <MessageSquare size={16} style={{ color: '#16A34A' }} />;
      default:
        return <Users size={16} style={{ color: '#8B5CF6' }} />;
    }
  };

  return (
    <div className="top-header" style={{ position: 'relative' }}>
      <div style={{ flex: 1 }}></div>

      {/* Right side actions */}
      <div className="header-actions" style={{ position: 'relative' }} ref={dropdownRef}>
        
        {/* Bell Icon Button */}
        <button
          className="header-icon-btn"
          title="Notifications"
          onClick={() => setShowDropdown(!showDropdown)}
          style={{ position: 'relative' }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: '#EF4444',
              color: 'white',
              fontSize: '10px',
              fontWeight: '700',
              borderRadius: '10px',
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid white'
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notifications Popover Dropdown */}
        {showDropdown && (
          <div style={{
            position: 'absolute',
            top: '48px',
            right: '0',
            width: '360px',
            maxHeight: '480px',
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
            border: '1px solid #E5E7EB',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#FAFBFC'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#111827' }}>Notifications</h3>
                {unreadCount > 0 && (
                  <span style={{ background: '#EEF2FF', color: '#4F46E5', fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '12px' }}>
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Mark all as read"
                  >
                    <CheckCheck size={14} /> Read all
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '12px', cursor: 'pointer' }}
                    title="Clear all notifications"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '380px' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF' }}>
                  <Bell size={32} style={{ color: '#D1D5DB', marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: '500' }}>No notifications</p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9CA3AF' }}>New lead & chat alerts will appear here</p>
                </div>
              ) : (
                notifications.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid #F3F4F6',
                      background: item.read ? 'white' : '#F0FDF4',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.background = item.read ? 'white' : '#F0FDF4')}
                  >
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: item.type === 'lead' ? '#DBEAFE' : item.type === 'message' ? '#DCFCE7' : '#F3E8FF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {getIcon(item.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </span>
                        <span style={{ fontSize: '10px', color: '#9CA3AF', flexShrink: 0, marginLeft: '6px' }}>
                          {getTimeAgo(item.timestamp)}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.desc}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteNotification(item.id, e)}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '2px', marginLeft: '4px' }}
                      title="Delete notification"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* User Profile Info */}
        <div className="header-profile">
          <div className="header-avatar">
            {user?.restaurantName?.[0]?.toUpperCase() || 'R'}
          </div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '13px', color: '#1a1a2e' }}>
              {user?.restaurantName || 'My Restaurant'}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              {user?.email || 'admin@restaurant.com'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
