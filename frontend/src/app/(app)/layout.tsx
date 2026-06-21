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
    <div style={{ zoom: 1.1, width: 'calc(100vw / 1.1)', overflowX: 'hidden' }}>
      <Sidebar />
      <main className="main-layout" style={{ width: 'calc(100% - var(--sidebar-width))', minHeight: 'calc(100vh / 1.1)', display: 'flex', flexDirection: 'column' }}>
        <TopHeader />
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
