'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Radio, UtensilsCrossed, Loader2, Save, Link, Plug, Lock, Palette, UploadCloud, Image as ImageIcon } from 'lucide-react';
import { useBranding } from '@/lib/hooks/useBranding';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [testing, setTesting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Separate states for branding and API settings to avoid mixing them
  const [brandingForm, setBrandingForm] = useState<any>({});
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const loginBgInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/api/settings').then(r => r.data) });
  const { data: brandingData, isLoading: brandingLoading } = useBranding();

  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  useEffect(() => { if (brandingData) setBrandingForm(brandingData); }, [brandingData]);

  const updateMutation = useMutation({ mutationFn: (data: any) => api.patch('/api/settings', data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Settings saved!'); }, onError: () => toast.error('Failed to save') });
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
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveAll = () => {
    updateMutation.mutate(form);
    updateBrandingMutation.mutate(brandingForm);
  };

  if (isLoading || brandingLoading) return <div style={{ padding: '32px' }}><Loader2 className="animate-spin text-emerald-600" /></div>;

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
