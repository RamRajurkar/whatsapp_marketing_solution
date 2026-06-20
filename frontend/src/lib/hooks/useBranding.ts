import { useQuery } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface BrandingData {
  appName: string;
  tagline: string;
  logoPath: string | null;
  loginBgPath: string | null;
  primaryColor: string;
  accentColor: string;
  darkColor: string;
  impactLines: string[];
  trustStats: { number: string; label: string }[];
}

export const defaultBranding: BrandingData = {
  appName: 'RestoChat',
  tagline: 'WhatsApp Marketing Solution',
  logoPath: null,
  loginBgPath: null,
  primaryColor: '#1B5E37',
  accentColor: '#2E7D4F',
  darkColor: '#0d2b1a',
  impactLines: [
    'Automate customer engagement via WhatsApp',
    'Increase repeat orders by 40% with targeted broadcasts',
    'Manage reservations and orders in real-time',
    'Reduce response time to under 2 minutes',
  ],
  trustStats: [
    { number: '10K+', label: 'Messages / Day' },
    { number: '500+', label: 'Businesses' },
    { number: '99.9%', label: 'Uptime' },
  ],
};

export function useBranding() {
  return useQuery<BrandingData>({
    queryKey: ['branding'],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings/branding`);
        if (!res.ok) throw new Error('Failed to fetch branding');
        return await res.json();
      } catch (err) {
        console.warn('Could not load branding, using defaults', err);
        return defaultBranding;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
