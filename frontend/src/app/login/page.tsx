'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, MessageCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { IMPACT_LINES, APP_NAME } from '@/lib/constants';
import './login.css';

export default function LoginPage() {
  const router = useRouter();
  const { token, setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentLine, setCurrentLine] = useState(0);

  // If already logged in, redirect
  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  // Rotate impact lines
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLine((prev) => (prev + 1) % IMPACT_LINES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !password) {
        toast.error('Please fill in all fields');
        return;
      }
      setLoading(true);
      try {
        const { data } = await api.post('/api/auth/login', { email, password });
        const userData = {
          id: data.user._id || data.user.id,
          email: data.user.email,
          businessName: data.user.restaurantName || '',
          restaurantName: data.user.restaurantName || '',
        };
        localStorage.setItem('wa_token', data.token);
        setAuth(data.token, userData);
        toast.success('Welcome back!');
        router.push('/dashboard');
      } catch (err: any) {
        const msg = err.response?.data?.detail
          || err.response?.data?.error
          || (err.code === 'ERR_NETWORK' ? 'Unable to connect to server. Please try again.' : 'Invalid credentials');
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [email, password, setAuth, router]
  );

  return (
    <div className="login-page">
      {/* ——— LEFT: Hero Panel ——— */}
      <div className="login-hero">
        {/* Background image */}
        <img
          className="login-hero-img"
          src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80"
          alt="Modern restaurant interior"
          loading="eager"
        />

        {/* Dark overlay */}
        <div className="login-hero-overlay" />

        {/* Decorative shape */}
        <div className="login-hero-shape" />

        {/* Text content */}
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

          {/* Rotating impact lines */}
          <div className="login-impact-carousel">
            {IMPACT_LINES.map((line, i) => (
              <div
                key={i}
                className={`login-impact-line ${i === currentLine ? 'active' : ''}`}
              >
                <CheckCircle2 size={16} />
                <span>{line}</span>
              </div>
            ))}
          </div>

          {/* Trust indicators */}
          <div className="login-trust-row">
            <div className="login-trust-item">
              <span className="login-trust-number">10K+</span>
              <span className="login-trust-label">Messages / Day</span>
            </div>
            <div className="login-trust-divider" />
            <div className="login-trust-item">
              <span className="login-trust-number">500+</span>
              <span className="login-trust-label">Businesses</span>
            </div>
            <div className="login-trust-divider" />
            <div className="login-trust-item">
              <span className="login-trust-number">99.9%</span>
              <span className="login-trust-label">Uptime</span>
            </div>
          </div>
        </div>
      </div>

      {/* ——— RIGHT: Login Form ——— */}
      <div className="login-form-panel">
        <div className="login-form-container">
          {/* Logo / brand */}
          <div className="login-brand">
            <div className="login-brand-icon">
              <MessageCircle size={22} color="white" />
            </div>
            <span className="login-brand-name">{APP_NAME}</span>
          </div>

          {/* Greeting */}
          <h2 className="login-greeting">Hi there, great to see you</h2>
          <p className="login-subtext">Sign in to your dashboard</p>

          {/* Form */}
          <form onSubmit={handleLogin} className="login-form" autoComplete="on">
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
                  autoComplete="current-password"
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

            {/* Remember me + Forgot */}
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
              <button type="button" className="login-forgot-btn">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="login-spinner" />
                  Signing in…
                </>
              ) : (
                <>
                  Log in
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Sign up link */}
          <p className="login-signup-text">
            Don&apos;t have an account? <button type="button" className="login-signup-link">Sign Up</button>
          </p>
        </div>
      </div>
    </div>
  );
}
