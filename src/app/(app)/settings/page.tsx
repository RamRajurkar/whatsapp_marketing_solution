'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [testing, setTesting] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/settings').then(r => r.data),
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch('/api/settings', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Settings saved!'); },
    onError: () => toast.error('Failed to save'),
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data } = await api.post('/api/settings/test-connection');
      toast.success(`✅ Connected! Phone: ${data.phoneInfo?.display_phone_number || data.phoneInfo?.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) return <div style={{ padding: '32px' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your WhatsApp Business API and restaurant information</p>
      </div>

      <div style={{ padding: '0 32px', maxWidth: '720px' }}>
        {/* WhatsApp API Settings */}
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #25D366, #128C7E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
              📡
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#0f172a' }}>WhatsApp Business API</h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Meta WhatsApp Cloud API credentials</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Phone Number ID</label>
              <input className="input-field" value={form.waPhoneNumberId || ''} onChange={e => setForm({ ...form, waPhoneNumberId: e.target.value })} placeholder="1194805713710366" />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Business Account ID</label>
              <input className="input-field" value={form.waBusinessAccountId || ''} onChange={e => setForm({ ...form, waBusinessAccountId: e.target.value })} placeholder="983729331097527" />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Access Token</label>
              <input className="input-field" type="password" value={form.waAccessToken || ''} onChange={e => setForm({ ...form, waAccessToken: e.target.value })} placeholder="EAA..." />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Webhook Verify Token</label>
              <input className="input-field" value={form.waVerifyToken || ''} onChange={e => setForm({ ...form, waVerifyToken: e.target.value })} placeholder="restaurant_webhook_verify_2024" />
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                Set this same token in Meta Developer Portal → Webhooks → Verify Token
              </p>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#15803d', fontWeight: '500' }}>
                🔗 Your Webhook URL: <code style={{ background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>https://your-domain.com/api/webhook</code>
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#166534' }}>
                For local testing, use ngrok: <code>ngrok http 5000</code> then copy the HTTPS URL
              </p>
            </div>

            <button
              onClick={testConnection}
              disabled={testing}
              className="btn-secondary"
              style={{ alignSelf: 'flex-start', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {testing ? '⏳ Testing...' : '🔌 Test Connection'}
            </button>
          </div>
        </div>

        {/* Business Info */}
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
              🍽️
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#0f172a' }}>Restaurant Information</h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Your business details</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Restaurant Name</label>
              <input className="input-field" value={form.restaurantName || ''} onChange={e => setForm({ ...form, restaurantName: e.target.value })} placeholder="My Restaurant" />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Business Name</label>
              <input className="input-field" value={form.businessName || ''} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="My Restaurant Pvt Ltd" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Address</label>
              <input className="input-field" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, State" />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Contact Number</label>
              <input className="input-field" value={form.contactNumber || ''} onChange={e => setForm({ ...form, contactNumber: e.target.value })} placeholder="+91 9876543210" />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Email</label>
              <input className="input-field" value={form.email || ''} disabled style={{ background: '#f8fafc', cursor: 'not-allowed' }} />
            </div>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
          style={{ padding: '12px 28px', fontSize: '15px', marginBottom: '32px' }}
        >
          {updateMutation.isPending ? '⏳ Saving...' : '💾 Save All Settings'}
        </button>
      </div>
    </div>
  );
}
