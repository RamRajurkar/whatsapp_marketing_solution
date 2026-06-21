'use client';

import { Search, Mail, Bell } from 'lucide-react';
import { useAuthStore } from '@/lib/store/authStore';

export function TopHeader() {
  const { user } = useAuthStore();

  return (
    <div className="top-header">
      <div style={{ flex: 1 }}></div>

      {/* Right side */}
      <div className="header-actions">
        <button className="header-icon-btn" title="Messages">
          <Mail size={18} />
        </button>
        <button className="header-icon-btn" title="Notifications">
          <Bell size={18} />
          <div className="notification-dot" />
        </button>

        {/* Profile */}
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
