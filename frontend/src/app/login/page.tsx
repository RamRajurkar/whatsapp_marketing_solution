'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, MessageCircle, ArrowRight, CheckCircle2, UserPlus } from 'lucide-react';
import { useBranding, defaultBranding } from '@/lib/hooks/useBranding';
import './login.css';

const DEFAULT_LOGIN_BG = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80';


export default function LoginPage() {
  const router = useRouter();
  const { token, setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isRegistered, setIsRegistered] = useState(true);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [currentLine, setCurrentLine] = useState(0);

  const { data: BRANDING_DATA, isLoading: brandingLoading } = useBranding();
  const BRANDING = BRANDING_DATA || defaultBranding;

  // If already logged in, redirect
  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  // Check registration status on mount
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const { data } = await api.get('/api/auth/registration-status');
        setIsRegistered(data.registered);
        // If not registered, automatically show registration mode
        if (!data.registered) {
          setIsRegisterMode(true);
        }
      } catch (err) {
        console.error('Failed to check registration status:', err);
      } finally {
        setCheckingStatus(false);
      }
    };
    checkRegistrationStatus();
  }, []);

  // Rotate impact lines
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLine((prev) => (prev + 1) % BRANDING.impactLines.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleAuthSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !password || (isRegisterMode && !restaurantName)) {
        toast.error('Please fill in all fields');
        return;
      }
      setLoading(true);
      try {
        if (isRegisterMode) {
          // Register flow
          const { data } = await api.post('/api/auth/register', {
            email,
            password,
            restaurantName,
          });
          const userData = {
            id: data.user._id || data.user.id,
            email: data.user.email,
            businessName: data.user.restaurantName || '',
            restaurantName: data.user.restaurantName || '',
          };
          localStorage.setItem('wa_token', data.token);
          document.cookie = `wa_token=${data.token}; path=/; max-age=604800; SameSite=Strict`;
          setAuth(data.token, userData);
          toast.success('Registration successful! Welcome to your dashboard.');
          router.push('/dashboard');
        } else {
          // Login flow
          const { data } = await api.post('/api/auth/login', { email, password });
          const userData = {
            id: data.user._id || data.user.id,
            email: data.user.email,
            businessName: data.user.restaurantName || '',
            restaurantName: data.user.restaurantName || '',
          };
          localStorage.setItem('wa_token', data.token);
          document.cookie = `wa_token=${data.token}; path=/; max-age=604800; SameSite=Strict`;
          setAuth(data.token, userData);
          toast.success('Login successful!');
          router.push('/dashboard');
        }
      } catch (err: any) {
        const msg = err.response?.data?.detail
          || err.response?.data?.error
          || (err.code === 'ERR_NETWORK' ? 'Unable to connect to server. Please try again.' : 'Authentication failed');
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [email, password, restaurantName, isRegisterMode, setAuth, router]
  );

  if (checkingStatus || brandingLoading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#030712' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' }}>
          <Loader2 style={{ width:40, height:40, color: BRANDING.primaryColor, animation:'spin 1s linear infinite' }} />
          <span style={{ color:'#6b7280', fontSize:'14px' }}>Loading {BRANDING.appName}...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* ——— LEFT: Hero Panel ——— */}
      <div className="login-hero">
        <img
          className="login-hero-img"
          src={BRANDING.loginBgPath || DEFAULT_LOGIN_BG}
          alt={BRANDING.appName}
          loading="eager"
        />
        <div className="login-hero-overlay" />
        <div className="login-hero-shape" />
        <div className="login-hero-content">
          <div className="login-hero-badge">
            <MessageCircle size={14} />
            WhatsApp Business Platform
          </div>

          <h1 className="login-hero-heading">
            Manage your data,<br />
            monitor performance,<br />
            and stay in control—<br />
            <span className="login-hero-heading-accent">securely.</span>
          </h1>

          <div className="login-impact-carousel">
            {BRANDING.impactLines.map((line, i) => (
              <div
                key={i}
                className={`login-impact-line ${i === currentLine ? 'active' : ''}`}
              >
                <CheckCircle2 size={16} />
                <span>{line}</span>
              </div>
            ))}
          </div>

          <div className="login-trust-row">
            {BRANDING.trustStats.map((stat, i) => (
              <>
                {i > 0 && <div key={`div-${i}`} className="login-trust-divider" />}
                <div key={stat.label} className="login-trust-item">
                  <span className="login-trust-number">{stat.number}</span>
                  <span className="login-trust-label">{stat.label}</span>
                </div>
              </>
            ))}
          </div>
        </div>
      </div>

      {/* ——— RIGHT: Auth Form ——— */}
      <div className="login-form-panel">
        <div className="login-form-container">
          <div className="login-brand">
            {/* Logo: image if provided, otherwise emoji icon */}
            {BRANDING.logoPath ? (
              <img
                src={BRANDING.logoPath}
                alt={BRANDING.appName}
                className="login-brand-logo-img"
              />
            ) : (
              <div className="login-brand-icon" style={{ background: `linear-gradient(135deg, ${BRANDING.primaryColor} 0%, ${BRANDING.accentColor} 100%)` }}>
                <MessageCircle size={22} color="white" />
              </div>
            )}
            <span className="login-brand-name">{BRANDING.appName}</span>
          </div>

          <h2 className="login-greeting">
            {isRegisterMode ? 'Create admin account' : 'Hi there, great to see you'}
          </h2>
          <p className="login-subtext">
            {isRegisterMode 
              ? 'Register your single-user credentials to start using RestoChat' 
              : 'Sign in to your dashboard'}
          </p>

          <form onSubmit={handleAuthSubmit} className="login-form" autoComplete="on">
            {/* Restaurant Name (Only for Registration) */}
            {isRegisterMode && (
              <div className="login-field">
                <label htmlFor="reg-restaurant-name" className="login-label">Restaurant/Business Name*</label>
                <input
                  id="reg-restaurant-name"
                  type="text"
                  className="login-input"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="My Restaurant"
                  required
                />
              </div>
            )}

            {/* Email */}
            <div className="login-field">
              <label htmlFor="login-email" className="login-label">Email*</label>
              <input
                id="login-email"
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div className="login-field">
              <label htmlFor="login-password" className="login-label">Password*</label>
              <div className="login-input-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember me (Only for Login) */}
            {!isRegisterMode && (
              <div className="login-options">
                <label className="login-checkbox-label" htmlFor="remember-me">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="login-checkbox"
                  />
                  <span className="login-checkmark" />
                  Remember me
                </label>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="login-spinner" />
                  {isRegisterMode ? 'Registering…' : 'Signing in…'}
                </>
              ) : (
                <>
                  {isRegisterMode ? (
                    <>
                      Register Admin
                      <UserPlus size={18} />
                    </>
                  ) : (
                    <>
                      Log in
                      <ArrowRight size={18} />
                    </>
                  )}
                </>
              )}
            </button>
          </form>

          {/* Toggle between Register/Login (Only shown if NOT registered) */}
          {!isRegistered && (
            <p className="login-signup-text">
              {isRegisterMode ? (
                <>
                  Already registered?{' '}
                  <button 
                    type="button" 
                    className="login-signup-link"
                    onClick={() => setIsRegisterMode(false)}
                  >
                    Log In
                  </button>
                </>
              ) : (
                <>
                  Need to setup?{' '}
                  <button 
                    type="button" 
                    className="login-signup-link"
                    onClick={() => setIsRegisterMode(true)}
                  >
                    Sign Up
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
