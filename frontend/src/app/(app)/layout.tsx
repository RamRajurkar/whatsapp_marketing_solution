'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Sidebar } from '@/components/Sidebar';
import { TopHeader } from '@/components/TopHeader';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token } = useAuthStore();

  useEffect(() => {
    if (!token) router.replace('/login');
  }, [token, router]);

  if (!token) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ zoom: 1.1, display: 'flex', height: 'calc(100% / 1.1)', width: 'calc(100% / 1.1)', overflow: 'hidden' }}>
        <Sidebar />
        <main className="main-layout" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
          <TopHeader />
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
