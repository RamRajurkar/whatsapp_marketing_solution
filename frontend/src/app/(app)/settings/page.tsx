'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Radio, UtensilsCrossed, Loader2, Save, Link, Plug, Lock } from 'lucide-react';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [testing, setTesting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/api/settings').then(r => r.data) });
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  const updateMutation = useMutation({ mutationFn: (data: any) => api.patch('/api/settings', data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Settings saved!'); }, onError: () => toast.error('Failed to save') });
  
  const testConnection = async () => {
    setTesting(true);
    try { const { data } = await api.post('/api/settings/test-connection'); toast.success(`Connected! Phone: ${data.phoneInfo?.display_phone_number || data.phoneInfo?.id}`);
    } catch (err: any) { toast.error(err.response?.data?.error || 'Connection test failed'); } finally { setTesting(false); }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword) {
      toast.error('Password cannot be empty');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setUpdatingPassword(true);
    try {
      await api.patch('/api/settings', { password: newPassword });
      toast.success('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (isLoading) return <div style={{ padding: '32px' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Settings</h1><p className="page-subtitle">Configure your WhatsApp Business API and restaurant information</p></div>
      <div style={{ padding: '0 32px', maxWidth: '720px' }}>
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #1B5E37, #2E7D4F)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Radio size={20} color="white" /></div>
            <div><h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a2e' }}>WhatsApp Business API</h2><p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Meta WhatsApp Cloud API credentials</p></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Phone Number ID</label><input className="input-field" value={form.waPhoneNumberId || ''} onChange={e => setForm({ ...form, waPhoneNumberId: e.target.value })} placeholder="1194805713710366" /></div>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Business Account ID</label><input className="input-field" value={form.waBusinessAccountId || ''} onChange={e => setForm({ ...form, waBusinessAccountId: e.target.value })} placeholder="983729331097527" /></div>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Access Token</label><input className="input-field" type="password" value={form.waAccessToken || ''} onChange={e => setForm({ ...form, waAccessToken: e.target.value })} placeholder="EAA..." /></div>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Webhook Verify Token</label><input className="input-field" value={form.waVerifyToken || ''} onChange={e => setForm({ ...form, waVerifyToken: e.target.value })} placeholder="restaurant_webhook_verify_2024" /><p style={{ margin: '6px 0 0', fontSize: '11px', color: '#9ca3af' }}>Set this same token in Meta Developer Portal</p></div>
            <div style={{ background: '#E8F5E9', border: '1px solid #A7D5B8', borderRadius: '12px', padding: '14px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#1B5E37', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}><Link size={14} /> Your Webhook URL: <code style={{ background: '#D1FAE5', padding: '2px 8px', borderRadius: '6px' }}>https://your-domain.com/api/webhook</code></p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#166534' }}>For local testing, use ngrok: <code>ngrok http 5000</code></p>
            </div>
            <button onClick={testConnection} disabled={testing} className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '10px 20px' }}>
              {testing ? <><Loader2 size={16} /> Testing...</> : <><Plug size={16} /> Test Connection</>}
            </button>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #F59E0B, #D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UtensilsCrossed size={20} color="white" /></div>
            <div><h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a2e' }}>Restaurant Information</h2><p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Your business details</p></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Restaurant Name</label><input className="input-field" value={form.restaurantName || ''} onChange={e => setForm({ ...form, restaurantName: e.target.value })} placeholder="My Restaurant" /></div>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Business Name</label><input className="input-field" value={form.businessName || ''} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="My Restaurant Pvt Ltd" /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Address</label><input className="input-field" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, State" /></div>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Contact Number</label><input className="input-field" value={form.contactNumber || ''} onChange={e => setForm({ ...form, contactNumber: e.target.value })} placeholder="+91 9876543210" /></div>
            <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Email</label><input className="input-field" value={form.email || ''} disabled style={{ background: '#FAFBFC', cursor: 'not-allowed' }} /></div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #EF4444, #DC2626)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={20} color="white" /></div>
            <div><h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a2e' }}>Security</h2><p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Change your account password</p></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>New Password</label><input className="input-field" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••••••" /></div>
              <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Confirm New Password</label><input className="input-field" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••••••" /></div>
            </div>
            <button onClick={handleUpdatePassword} disabled={updatingPassword} className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '10px 20px', marginTop: '8px' }}>
              {updatingPassword ? <><Loader2 size={16} /> Updating...</> : 'Update Password'}
            </button>
          </div>
        </div>
        <button className="btn-primary" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending} style={{ padding: '12px 28px', fontSize: '15px', marginBottom: '32px' }}>
          {updateMutation.isPending ? <><Loader2 size={16} /> Saving...</> : <><Save size={16} /> Save All Settings</>}
        </button>
      </div>
    </div>
  );
}
