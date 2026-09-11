import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface UserProfile {
  _id: string;
  email: string;
  name: string;
  restaurantName?: string;
  tenantId?: string;
  role: string;
  agencyId?: string | null;
  enabledChannels?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export function useUserChannels() {
  const { data: user, isLoading, error, refetch } = useQuery<UserProfile>({
    queryKey: ['auth_me'],
    queryFn: async () => {
      const res = await api.get('/api/auth/me');
      return res.data;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const channels = user?.enabledChannels || ['whatsapp', 'gbp'];
  const isWhatsAppEnabled = channels.includes('whatsapp');
  const isGbpEnabled = channels.includes('gbp');
  const isOmnichannel = isWhatsAppEnabled && isGbpEnabled;
  const isWhatsAppOnly = isWhatsAppEnabled && !isGbpEnabled;
  const isGbpOnly = isGbpEnabled && !isWhatsAppEnabled;

  const isChannelEnabled = (channel: string) => channels.includes(channel);

  return {
    user,
    enabledChannels: channels,
    isWhatsAppEnabled,
    isGbpEnabled,
    isOmnichannel,
    isWhatsAppOnly,
    isGbpOnly,
    isChannelEnabled,
    isLoading,
    error,
    refetch,
  };
}
