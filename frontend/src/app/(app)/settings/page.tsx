'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Radio, UtensilsCrossed, Loader2, Save, Link, Plug, Lock, Palette, UploadCloud, Image as ImageIcon, Volume2, Zap } from 'lucide-react';
import { useBranding } from '@/lib/hooks/useBranding';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [testing, setTesting] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('notificationSoundEnabled');
    if (saved !== null) {
      setSoundEnabled(saved === 'true');
    }
  }, []);

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem('notificationSoundEnabled', enabled ? 'true' : 'false');
    toast.success(`Notification sound ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleTestSound = () => {
    const soundEnabled = localStorage.getItem('notificationSoundEnabled') !== 'false';
    if (!soundEnabled) {
      toast.error('Sound is currently disabled. Enable sound above to hear alerts.');
      return;
    }
    try {
      const { playNotificationChime } = require('@/components/TopHeader');
      playNotificationChime();
      toast.success('Playing notification sound chime! 🔊');
    } catch {
      toast.success('Sound chime triggered');
    }
  };

  const [brandingForm, setBrandingForm] = useState<any>({});
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const loginBgInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/api/settings/').then(r => r.data) });
  const { data: brandingData, isLoading: brandingLoading } = useBranding();

  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  useEffect(() => { if (brandingData) setBrandingForm(brandingData); }, [brandingData]);

  const updateMutation = useMutation({ mutationFn: (data: any) => api.patch('/api/settings/', data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Settings saved!'); }, onError: () => toast.error('Failed to save') });
  const updateBrandingMutation = useMutation({ mutationFn: (data: any) => api.patch('/api/settings/branding', data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branding'] }); toast.success('Branding saved!'); }, onError: () => toast.error('Failed to save branding') });
  
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'loginBg') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('type', type);
    formData.append('file', file);

    const isLogo = type === 'logo';
    isLogo ? setUploadingLogo(true) : setUploadingBg(true);

    try {
      await api.post('/api/settings/upload-branding', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      queryClient.invalidateQueries({ queryKey: ['branding'] });
      toast.success(`${isLogo ? 'Logo' : 'Background'} uploaded successfully!`);
    } catch (err) {
      toast.error(`Failed to upload ${isLogo ? 'logo' : 'background'}`);
    } finally {
      isLogo ? setUploadingLogo(false) : setUploadingBg(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveAll = () => {
    updateMutation.mutate(form);
    updateBrandingMutation.mutate(brandingForm);
  };

  if (isLoading || brandingLoading) return <div style={{ padding: '32px' }}><Loader2 className="animate-spin text-emerald-600" /></div>;

  const testWebhook = async () => {
    if (!form.leadsWebhookUrl) {
      toast.error('Please enter your Outbound Lead Webhook URL first');
      return;
    }
    setTestingWebhook(true);
    try {
      const { data } = await api.post('/api/settings/test-lead-webhook', { webhookUrl: form.leadsWebhookUrl });
      if (data?.success) {
        toast.success(`Test payload sent successfully to ${form.leadsWebhookUrl}! (Status: ${data.status_code || 200})`);
      } else {
        toast.error(`Webhook test failed: ${data?.error || 'Check server logs'}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to dispatch test webhook');
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Settings</h1><p className="page-subtitle">Configure your WhatsApp Business API, CRM Webhooks, and business information</p></div>
      <div style={{ padding: '0 32px', maxWidth: '720px' }}>
        
        {/* Outbound Lead Webhook Settings */}
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Link size={20} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a2e' }}>Outbound CRM Lead Webhook</h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Automatically POST captured leads to your central dashboard in real time</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                Central Dashboard Leads Webhook URL
              </label>
              <input
                className="input-field"
                value={form.leadsWebhookUrl || ''}
                onChange={e => setForm({ ...form, leadsWebhookUrl: e.target.value })}
                placeholder="https://your-central-dashboard.com/api/webhooks/whatsapp-leads"
              />
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#6b7280' }}>
                Whenever a customer completes a product inquiry on WhatsApp, a POST request with full lead details (product, code, quantity, notes, customer phone) will be automatically sent to this URL.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={testWebhook}
                disabled={testingWebhook}
                className="btn-secondary"
                style={{ padding: '9px 18px', fontSize: '13px' }}
              >
                {testingWebhook ? <><Loader2 size={15} /> Sending Test...</> : '🧪 Send Test Webhook Payload'}
              </button>
            </div>
          </div>
        </div>

        {/* WhatsApp Sending Rate & Account Tier Controls */}
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #0284C7, #0369A1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={20} color="white" /></div>
            <div><h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a2e' }}>WhatsApp Rate Limits & Sending Speed</h2><p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Configure Messages Per Second (MPS) and Meta Tier caps for new & warming phone numbers</p></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Max Messages Per Second (MPS)</label>
              <select className="input-field" value={form.maxMpsLimit || 25} onChange={e => setForm({ ...form, maxMpsLimit: parseInt(e.target.value) })}>
                <option value={10}>🐢 10 MPS (Slow Warmup Mode)</option>
                <option value={25}>⚡ 25 MPS (Standard Mode)</option>
                <option value={50}>🚀 50 MPS (Medium Speed)</option>
                <option value={80}>🏎️ 80 MPS (Fast)</option>
                <option value={250}>🔥 250 MPS (High Speed)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Daily Recipient Tier Limit</label>
              <select className="input-field" value={form.dailyTierLimit || 250} onChange={e => setForm({ ...form, dailyTierLimit: parseInt(e.target.value) })}>
                <option value={250}>250 Contacts / 24h (Tier 0)</option>
                <option value={1000}>1,000 Contacts / 24h (Tier 1)</option>
                <option value={10000}>10,000 Contacts / 24h (Tier 2)</option>
                <option value={100000}>100,000 Contacts / 24h (Tier 3)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notification Sound Settings */}
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #10B981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Volume2 size={20} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a2e' }}>Notification Sound Alerts</h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Play audio chime for incoming WhatsApp leads, chats, and messages</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#111827' }}>Sound Notifications</div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Play audio chime when a new B2B lead or chat message arrives</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={handleTestSound}
                className="btn-secondary"
                style={{ padding: '7px 14px', fontSize: '12px' }}
              >
                🔊 Test Sound
              </button>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={e => handleToggleSound(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: soundEnabled ? '#10B981' : '#D1D5DB',
                  borderRadius: '24px', transition: '0.2s'
                }}>
                  <span style={{
                    position: 'absolute', content: '""', height: '18px', width: '18px',
                    left: soundEnabled ? '26px' : '3px', bottom: '3px',
                    backgroundColor: 'white', borderRadius: '50%', transition: '0.2s'
                  }} />
                </span>
              </label>
            </div>
          </div>
        </div>

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

        {/* Branding & Appearance */}
        <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Palette size={20} color="white" /></div>
            <div><h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1a1a2e' }}>Branding & Appearance</h2><p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Customize your app's look and feel</p></div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>App Name</label><input className="input-field" value={brandingForm.appName || ''} onChange={e => setBrandingForm({ ...brandingForm, appName: e.target.value })} placeholder="RestoChat" /></div>
              <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Tagline</label><input className="input-field" value={brandingForm.tagline || ''} onChange={e => setBrandingForm({ ...brandingForm, tagline: e.target.value })} placeholder="WhatsApp Marketing Solution" /></div>
            </div>

            {/* File Uploaders */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginTop: '8px' }}>
              {/* Login BG Upload */}
              <div style={{ border: '1px dashed #D1D5DB', borderRadius: '12px', padding: '20px', textAlign: 'center', background: '#FAFBFC', position: 'relative' }}>
                <input type="file" accept="image/png, image/jpeg, image/webp" style={{ display: 'none' }} ref={loginBgInputRef} onChange={e => handleImageUpload(e, 'loginBg')} />
                {brandingData?.loginBgPath ? (
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                    <img src={brandingData.loginBgPath} alt="Login BG" style={{ width: '100%', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                  </div>
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><ImageIcon size={20} color="#6B7280" /></div>
                )}
                <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '600', color: '#111827' }}>Login Background</h3>
                <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#6B7280' }}>Recommended: Landscape, min 1200×800px<br/>(JPG, PNG, WEBP)</p>
                <button onClick={() => loginBgInputRef.current?.click()} disabled={uploadingBg} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '13px', width: '100%' }}>
                  {uploadingBg ? <><Loader2 size={14} className="animate-spin"/> Uploading...</> : <><UploadCloud size={14}/> {brandingData?.loginBgPath ? 'Change Background' : 'Upload Background'}</>}
                </button>
              </div>

            </div>
          </div>
        </div>

        <button className="btn-primary" onClick={handleSaveAll} disabled={updateMutation.isPending || updateBrandingMutation.isPending} style={{ padding: '12px 28px', fontSize: '15px', marginBottom: '32px' }}>
          {(updateMutation.isPending || updateBrandingMutation.isPending) ? <><Loader2 size={16} className="animate-spin"/> Saving...</> : <><Save size={16} /> Save All Settings</>}
        </button>
      </div>
    </div>
  );
}
