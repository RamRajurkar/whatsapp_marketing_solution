'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  ShieldAlert,
  Users,
  Layers,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Radio,
  Search,
  RefreshCw,
  Sliders,
  Check,
  Building2
} from 'lucide-react';

const AVAILABLE_CHANNELS = ['whatsapp', 'gbp', 'voice', 'sms'];

export default function SuperadminPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [channelsModalOpen, setChannelsModalOpen] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  // Fetch tenants from real backend API
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['superadmin_tenants', searchTerm],
    queryFn: async () => {
      const res = await api.get('/api/superadmin/tenants', {
        params: { search: searchTerm || undefined }
      });
      return res.data;
    }
  });

  // Channel update mutation
  const channelMutation = useMutation({
    mutationFn: async ({ tenantId, enabledChannels }: { tenantId: string; enabledChannels: string[] }) => {
      const res = await api.patch(`/api/superadmin/tenants/${tenantId}/channels`, { enabledChannels });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Tenant channels updated successfully');
      queryClient.invalidateQueries({ queryKey: ['superadmin_tenants'] });
      setChannelsModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update channels');
    }
  });

  // Impersonation mutation
  const impersonateMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      setImpersonatingId(tenantId);
      const res = await api.post(`/api/superadmin/impersonate/${tenantId}`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Impersonating ${data.tenant.name}`);
      localStorage.setItem('wa_token', data.token);
      document.cookie = `wa_token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
      window.location.href = '/dashboard';
    },
    onError: (err: any) => {
      setImpersonatingId(null);
      toast.error(err.response?.data?.detail || 'Impersonation failed');
    }
  });

  const tenants = data?.tenants || [];
  const total = data?.total || 0;

  const handleToggleChannel = (channel: string) => {
    if (!selectedTenant) return;
    const current = selectedTenant.enabledChannels || [];
    const updated = current.includes(channel)
      ? current.filter((c: string) => c !== channel)
      : [...current, channel];
    setSelectedTenant({ ...selectedTenant, enabledChannels: updated });
  };

  return (
    <div style={{ padding: '24px 32px' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={26} color="#DC2626" />
              Superadmin Control Plane
            </h1>
            <p className="page-subtitle">
              Manage platform tenants, toggle channel entitlements, and launch audit-logged support impersonation.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Active Tenants</span>
            <Building2 size={20} color="#2563EB" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '8px', color: '#111827' }}>
            {isLoading ? '...' : total}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Platform Mode</span>
            <Radio size={20} color="#16A34A" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '8px', color: '#16A34A' }}>
            Multi-Tenant SaaS
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Isolation Status</span>
            <CheckCircle2 size={20} color="#16A34A" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '8px', color: '#111827' }}>
            Enforced & Scoped
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <Search size={16} color="#9CA3AF" />
          <input
            type="text"
            placeholder="Search tenants by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '14px',
              background: 'transparent'
            }}
          />
        </div>
      </div>

      {/* Tenants Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>TENANT NAME</th>
              <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>PLAN</th>
              <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>ENABLED CHANNELS</th>
              <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>USERS</th>
              <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>STATUS</th>
              <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
                  Loading tenant directory...
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
                  No tenants registered yet.
                </td>
              </tr>
            ) : (
              tenants.map((tenant: any) => (
                <tr key={tenant._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{tenant.name}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace' }}>ID: {tenant._id}</div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      background: tenant.plan === 'enterprise' ? '#EDE9FE' : '#E0E7FF',
                      color: tenant.plan === 'enterprise' ? '#6B21A8' : '#3730A3'
                    }}>
                      {tenant.plan || 'starter'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(tenant.enabledChannels || ['whatsapp']).map((ch: string) => (
                        <span
                          key={ch}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: ch === 'whatsapp' ? '#DCFCE7' : ch === 'gbp' ? '#DBEAFE' : '#F3F4F6',
                            color: ch === 'whatsapp' ? '#166534' : ch === 'gbp' ? '#1E40AF' : '#374151'
                          }}
                        >
                          {ch.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '13px', color: '#374151' }}>
                    {tenant.userCount || 0}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      background: tenant.status === 'active' ? '#DCFCE7' : '#FEE2E2',
                      color: tenant.status === 'active' ? '#15803D' : '#B91C1C'
                    }}>
                      {tenant.status || 'active'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setSelectedTenant(tenant);
                          setChannelsModalOpen(true);
                        }}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Sliders size={13} /> Channels
                      </button>
                      <button
                        onClick={() => impersonateMutation.mutate(tenant._id)}
                        disabled={impersonatingId === tenant._id}
                        className="btn-primary"
                        style={{ fontSize: '12px', padding: '6px 12px', background: '#DC2626', borderColor: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <ExternalLink size={13} />
                        {impersonatingId === tenant._id ? 'Connecting...' : 'Impersonate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Channel Entitlement Modal */}
      {channelsModalOpen && selectedTenant && (
        <div className="modal-overlay" onClick={() => setChannelsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: '700' }}>
              Manage Channels: {selectedTenant.name}
            </h3>
            <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
              Toggle channel modules enabled for this tenant. Missing channels are blocked by the <code>require_channel</code> guard with 403 Forbidden.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {AVAILABLE_CHANNELS.map((ch) => {
                const isEnabled = (selectedTenant.enabledChannels || []).includes(ch);
                return (
                  <div
                    key={ch}
                    onClick={() => handleToggleChannel(ch)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: `1.5px solid ${isEnabled ? '#2563EB' : '#E5E7EB'}`,
                      background: isEnabled ? '#EFF6FF' : '#FFFFFF',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: isEnabled ? '#1E40AF' : '#374151' }}>
                        {ch.toUpperCase()} Channel
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>
                        {ch === 'whatsapp' ? 'WhatsApp Cloud API & Chatbot flow' :
                         ch === 'gbp' ? 'Google Business Profile reviews & posts' :
                         ch === 'voice' ? 'Automated voice caller & IVR' : 'SMS transactional gateway'}
                      </div>
                    </div>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '4px',
                      background: isEnabled ? '#2563EB' : '#F3F4F6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white'
                    }}>
                      {isEnabled && <Check size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setChannelsModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => channelMutation.mutate({
                  tenantId: selectedTenant._id,
                  enabledChannels: selectedTenant.enabledChannels
                })}
              >
                Save Channels
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
