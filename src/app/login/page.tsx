'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { MessageCircle, Loader2, ArrowRight, Info } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('admin@restaurant.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('wa_token', data.token);
      setAuth(data.token, data.user);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f1923 0%, #1a2a38 50%, #0f2417 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(27,94,55,0.15) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(46,125,79,0.1) 0%, transparent 70%)' }} />
      </div>
      <div style={{ width: '100%', maxWidth: '420px', animation: 'fadeIn 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '20px',
            background: 'linear-gradient(135deg, #1B5E37, #2E7D4F)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '16px', boxShadow: '0 8px 32px rgba(27, 94, 55, 0.4)',
          }}>
            <MessageCircle size={32} color="white" />
          </div>
          <h1 style={{ color: 'white', fontSize: '28px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>RestoChat</h1>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: '8px 0 0' }}>Restaurant WhatsApp Manager</p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
          padding: '36px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        }}>
          <h2 style={{ color: 'white', fontSize: '20px', fontWeight: '700', margin: '0 0 8px' }}>Welcome back</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 28px' }}>Sign in to manage your restaurant</p>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@restaurant.com" required
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = '#1B5E37'} onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = '#1B5E37'} onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: '12px', opacity: loading ? 0.7 : 1, justifyContent: 'center' }}>
              {loading ? <><Loader2 size={18} /> Signing in...</> : <>Sign in <ArrowRight size={18} /></>}
            </button>
          </form>
          <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(27,94,55,0.12)', borderRadius: '12px', border: '1px solid rgba(27,94,55,0.25)' }}>
            <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0, lineHeight: '1.6', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Info size={14} style={{ color: '#2E7D4F', flexShrink: 0, marginTop: '2px' }} />
              <span><strong style={{ color: '#2E7D4F' }}>Default credentials:</strong><br />Email: admin@restaurant.com<br />Password: Admin@123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
