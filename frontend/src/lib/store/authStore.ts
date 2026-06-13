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

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => {
        set({ token: null, user: null });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('wa_token');
        }
      },
      isAuthenticated: () => !!get().token,
    }),
    { name: 'wa_auth' }
  )
);
