import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  businessName: string;
  restaurantName: string;
}

interface AuthStore {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

/** Write / delete a cookie so Next.js middleware can read the token server-side. */
function setCookie(name: string, value: string, days = 7) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        set({ token, user });
        // Sync token to cookie so middleware can protect routes server-side
        setCookie('wa_token', token);
        localStorage.setItem('wa_token', token);
      },
      clearAuth: () => {
        set({ token: null, user: null });
        deleteCookie('wa_token');
        localStorage.removeItem('wa_token');
      },
      isAuthenticated: () => !!get().token,
    }),
    { name: 'wa_auth' }
  )
);
