'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Bot, Save, ToggleLeft, ToggleRight, MapPin, Clock, FileText,
  Smartphone, MessageCircle, CheckCircle2, AlertCircle, Sparkles,
  Info, ChevronRight
} from 'lucide-react';

/* ── Phone Preview Component ──────────────────────────────────────────────── */
function PhonePreview({ form }: { form: any }) {
  const hasData = form.welcomeMessage || form.addressText || form.menuUrl || form.timingsText;

  return (
    <div style={{ position: 'sticky', top: '24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '16px', padding: '0 4px',
      }}>
        <Smartphone size={16} style={{ color: '#6b7280' }} />
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Live Preview
        </span>
      </div>

      {/* Phone Frame */}
      <div style={{
        width: '100%', maxWidth: '320px',
        background: '#0B141A',
        borderRadius: '28px',
        padding: '8px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
        margin: '0 auto',
      }}>
        {/* Screen */}
        <div style={{
          background: '#0B141A',
          borderRadius: '22px',
          overflow: 'hidden',
        }}>
          {/* WhatsApp Header */}
          <div style={{
            background: '#1F2C34',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #1B5E37, #25D366)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bot size={18} style={{ color: 'white' }} />
            </div>
            <div>
              <div style={{ color: 'white', fontSize: '14px', fontWeight: '600' }}>Your Restaurant</div>
              <div style={{ color: '#8696A0', fontSize: '11px' }}>online</div>
            </div>
          </div>

          {/* Chat Area */}
          <div style={{
            background: '#0B141A',
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'none\'/%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1\' fill=\'%23ffffff08\'/%3E%3Ccircle cx=\'60\' cy=\'40\' r=\'1\' fill=\'%23ffffff08\'/%3E%3Ccircle cx=\'80\' cy=\'70\' r=\'1\' fill=\'%23ffffff08\'/%3E%3C/svg%3E")',
            padding: '16px 12px',
            minHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {/* Incoming "Hi" message */}
            <div style={{ alignSelf: 'flex-end' }}>
              <div style={{
                background: '#005C4B',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '10px 10px 2px 10px',
                fontSize: '13px',
                maxWidth: '200px',
              }}>
                Hi 👋
                <span style={{ float: 'right', marginLeft: '8px', fontSize: '10px', color: '#8696A0', marginTop: '4px' }}>12:00</span>
              </div>
            </div>

            {/* Bot welcome message with buttons */}
            <div style={{ alignSelf: 'flex-start', maxWidth: '250px' }}>
              <div style={{
                background: '#1F2C34',
                borderRadius: '2px 10px 10px 10px',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 12px' }}>
                  <p style={{
                    margin: 0, color: '#E9EDEF', fontSize: '13px', lineHeight: '1.45',
                    whiteSpace: 'pre-line', wordBreak: 'break-word',
                  }}>
                    {form.welcomeMessage || 'Welcome to our Restaurant! 🍔 How can we help you today?'}
                  </p>
                  <span style={{ float: 'right', fontSize: '10px', color: '#8696A0', marginTop: '4px' }}>12:00</span>
                </div>
                {/* Interactive Buttons */}
                <div style={{ borderTop: '1px solid #2A3942' }}>
                  {['📍 Address', '📜 Menu', '🕒 Timings'].map((btn, i) => (
                    <div key={i} style={{
                      padding: '10px',
                      textAlign: 'center',
                      color: '#53BDEB',
                      fontSize: '13px',
                      fontWeight: '500',
                      borderTop: i > 0 ? '1px solid #2A3942' : 'none',
                      cursor: 'default',
                    }}>
                      {btn}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Simulated button tap */}
            {form.addressText && (
              <>
                <div style={{ alignSelf: 'flex-end' }}>
                  <div style={{
                    background: '#005C4B', color: 'white',
                    padding: '8px 12px', borderRadius: '10px 10px 2px 10px',
                    fontSize: '13px',
                  }}>
                    📍 Address
                    <span style={{ float: 'right', marginLeft: '8px', fontSize: '10px', color: '#8696A0', marginTop: '4px' }}>12:01</span>
                  </div>
                </div>
                <div style={{ alignSelf: 'flex-start', maxWidth: '250px' }}>
                  <div style={{
                    background: '#1F2C34', color: '#E9EDEF',
                    padding: '8px 12px', borderRadius: '2px 10px 10px 10px',
                    fontSize: '13px', lineHeight: '1.45',
                    whiteSpace: 'pre-line', wordBreak: 'break-word',
                  }}>
                    {form.addressText}
                    <span style={{ float: 'right', marginLeft: '8px', fontSize: '10px', color: '#8696A0', marginTop: '4px' }}>12:01</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Status Badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '6px 14px', borderRadius: '20px',
      background: isActive ? '#E8F5E9' : '#FEE2E2',
      color: isActive ? '#1B5E37' : '#B91C1C',
      fontSize: '12px', fontWeight: '600',
    }}>
      {isActive ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {isActive ? 'Bot Active' : 'Bot Inactive'}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    isActive: false,
    welcomeMessage: '',
    addressText: '',
    menuUrl: '',
    timingsText: '',
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['bot_settings'],
    queryFn: () => api.get('/api/bot').then((res) => res.data),
  });

  useEffect(() => {
    if (settings) {
      setForm({
        isActive: settings.isActive || false,
        welcomeMessage: settings.welcomeMessage || '',
        addressText: settings.addressText || '',
        menuUrl: settings.menuUrl || '',
        timingsText: settings.timingsText || '',
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/api/bot', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot_settings'] });
      toast.success('Chatbot settings saved successfully!');
    },
    onError: () => {
      toast.error('Failed to save chatbot settings.');
    },
  });

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px' }}>
        <div className="skeleton" style={{ height: '24px', width: '200px', borderRadius: '8px', marginBottom: '12px' }} />
        <div className="skeleton" style={{ height: '400px', borderRadius: '16px' }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-title">Chatbot Settings</h1>
            <p className="page-subtitle">Configure your automated interactive welcome flow</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <StatusBadge isActive={form.isActive} />
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Save size={16} />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 32px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px', maxWidth: '1100px' }}>
        {/* ── Left Column: Settings ── */}
        <div>
          {/* Toggle Card */}
          <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: form.isActive ? 'linear-gradient(135deg, #1B5E37, #25D366)' : '#f3f4f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s',
                }}>
                  <Bot size={22} style={{ color: form.isActive ? 'white' : '#9ca3af' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>Interactive Welcome Flow</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
                    Auto-greet new customers with interactive quick-reply buttons
                  </p>
                </div>
              </div>
              <button
                onClick={() => setForm({ ...form, isActive: !form.isActive })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.isActive ? '#1B5E37' : '#9CA3AF', transition: 'color 0.2s' }}
                aria-label="Toggle chatbot"
              >
                {form.isActive ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
              </button>
            </div>
          </div>

          {/* How It Works */}
          <div className="glass-card" style={{
            padding: '16px 20px', marginBottom: '20px',
            background: '#FAFBFC', border: '1px solid #E5E7EB',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Info size={14} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>How It Works</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                'Customer sends "Hi", "Hello", "Hey", "Menu", "Help", or "Start"',
                'Bot replies with your welcome message + 3 interactive buttons',
                'Customer taps a button → Bot sends the configured response',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                    background: '#1B5E37', color: 'white', fontSize: '11px', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Settings Fields */}
          <div style={{ opacity: form.isActive ? 1 : 0.5, pointerEvents: form.isActive ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
            {/* Welcome Message */}
            <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Sparkles size={16} style={{ color: '#F59E0B' }} />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>Welcome Message</h4>
              </div>
              <textarea
                className="input-field"
                rows={3}
                value={form.welcomeMessage}
                onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
                placeholder="Welcome to our Restaurant! 🍔 How can we help you today?"
                style={{ resize: 'vertical' }}
              />
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MessageCircle size={10} />
                Sent along with 3 interactive buttons: [📍 Address] [📜 Menu] [🕒 Timings]
              </p>
            </div>

            {/* Button Responses */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <h4 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '700', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ChevronRight size={16} style={{ color: '#1B5E37' }} />
                Button Responses
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#6b7280' }}>
                Configure what the bot replies when a customer taps each button.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Address */}
                <div style={{
                  padding: '16px', background: '#FAFBFC', borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                }}>
                  <label style={{
                    fontSize: '13px', fontWeight: '600', color: '#374151',
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <MapPin size={14} style={{ color: '#EF4444' }} />
                    </div>
                    Address Response
                  </label>
                  <textarea
                    className="input-field"
                    rows={2}
                    value={form.addressText}
                    onChange={(e) => setForm({ ...form, addressText: e.target.value })}
                    placeholder="We are located at 123 Food Street. 📍 Google Maps: https://maps.app.goo.gl/..."
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Menu */}
                <div style={{
                  padding: '16px', background: '#FAFBFC', borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                }}>
                  <label style={{
                    fontSize: '13px', fontWeight: '600', color: '#374151',
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText size={14} style={{ color: '#3B82F6' }} />
                    </div>
                    Menu Link Response
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={form.menuUrl}
                    onChange={(e) => setForm({ ...form, menuUrl: e.target.value })}
                    placeholder="https://yourwebsite.com/menu.pdf"
                  />
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>
                    Paste a public URL to your menu PDF or image. You can upload one in Menu Management.
                  </p>
                </div>

                {/* Timings */}
                <div style={{
                  padding: '16px', background: '#FAFBFC', borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                }}>
                  <label style={{
                    fontSize: '13px', fontWeight: '600', color: '#374151',
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Clock size={14} style={{ color: '#F59E0B' }} />
                    </div>
                    Timings Response
                  </label>
                  <textarea
                    className="input-field"
                    rows={2}
                    value={form.timingsText}
                    onChange={(e) => setForm({ ...form, timingsText: e.target.value })}
                    placeholder="We are open Monday to Sunday from 10 AM to 11 PM. 🕒"
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Phone Preview ── */}
        <PhonePreview form={form} />
      </div>
    </div>
  );
}
