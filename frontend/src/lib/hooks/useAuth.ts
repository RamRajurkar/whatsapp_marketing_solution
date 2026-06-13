'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import api from '@/lib/api';

/**
 * Production-ready auth hook.
 * - Verifies token on mount via /api/auth/me
 * - Auto-redirects on invalid session
 * - Provides login / logout helpers
 */
export function useAuth() {
  const router = useRouter();
  const { token, user, setAuth, clearAuth } = useAuthStore();
  const verifiedRef = useRef(false);

  // Verify session on mount
  useEffect(() => {
    if (!token || verifiedRef.current) return;

    const verify = async () => {
      try {
        const { data } = await api.get('/api/auth/me');
        // Refresh user data from server
        setAuth(token, {
          id: data._id,
          email: data.email,
          businessName: data.restaurantName || data.businessName || '',
          restaurantName: data.restaurantName || '',
        });
        verifiedRef.current = true;
      } catch {
        // Token invalid or expired
        clearAuth();
        localStorage.removeItem('wa_token');
        router.replace('/login');
      }
    };

    verify();
  }, [token, setAuth, clearAuth, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post('/api/auth/login', { email, password });
      const userData = {
        id: data.user._id || data.user.id,
        email: data.user.email,
        businessName: data.user.restaurantName || data.user.businessName || '',
        restaurantName: data.user.restaurantName || '',
      };
      localStorage.setItem('wa_token', data.token);
      setAuth(data.token, userData);
      verifiedRef.current = true;
      return data;
    },
    [setAuth]
  );

  const logout = useCallback(() => {
    clearAuth();
    localStorage.removeItem('wa_token');
    verifiedRef.current = false;
    router.replace('/login');
  }, [clearAuth, router]);

  return {
    token,
    user,
    isAuthenticated: !!token,
    login,
    logout,
  };
}
