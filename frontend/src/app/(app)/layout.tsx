'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Sidebar } from '@/components/Sidebar';
import { TopHeader } from '@/components/TopHeader';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token } = useAuthStore();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    const storedToken = token || (typeof window !== 'undefined' ? localStorage.getItem('wa_token') : null);

    if (!storedToken) {
      router.replace('/login');
    } else {
      document.body.style.overflow = 'hidden';
    }
    return () => { 
      document.body.style.overflow = ''; 
    };
  }, [token, isHydrated, router]);

  const effectiveToken = token || (typeof window !== 'undefined' ? localStorage.getItem('wa_token') : null);

  if (!isHydrated || !effectiveToken) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <main className="main-layout" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <TopHeader />
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
