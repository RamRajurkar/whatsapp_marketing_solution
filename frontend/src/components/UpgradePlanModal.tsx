'use client';

import React from 'react';
import { X, Check, Sparkles, MessageCircle, Star, ShieldCheck, ArrowRight } from 'lucide-react';

interface UpgradePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetSuite?: 'whatsapp' | 'gbp';
}

export function UpgradePlanModal({ isOpen, onClose, targetSuite }: UpgradePlanModalProps) {
  if (!isOpen) return null;

  const handleContactUpgrade = (planName: string) => {
    const text = encodeURIComponent(`Hi Black Angler Team! I would like to upgrade my subscription to the "${planName}" plan.`);
    window.open(`https://wa.me/918625067058?text=${text}`, '_blank');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        maxWidth: '850px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        position: 'relative',
        animation: 'modalFadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
        }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: '#EFF6FF',
              color: '#2563EB',
              fontSize: '12px',
              fontWeight: '700',
              marginBottom: '8px'
            }}>
              <Sparkles size={14} /> Subscription Expansion
            </div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#0F172A' }}>
              {targetSuite === 'gbp' ? 'Unlock Google Business Profile Suite' : 'Unlock WhatsApp Marketing Suite'}
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#64748B' }}>
              Select a specialized plan or activate our all-in-one Omnichannel Growth Bundle.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#F1F5F9',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{
          padding: '28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          background: '#F8FAFC'
        }}>
          {/* Plan 1: WhatsApp Suite */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: targetSuite === 'whatsapp' ? '2px solid #22C55E' : '1px solid #E2E8F0',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>WhatsApp Pro</h3>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', minHeight: '36px' }}>
              Official Meta Cloud API marketing and automated bot operations.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', fontSize: '12px', color: '#334155', flex: 1 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#166534" /> Live Team Chat Inbox</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#166534" /> Visual Chatbot Flow Studio</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#166534" /> Bulk Broadcast Campaigns</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Check size={14} color="#166534" /> Catalogs & Price Lists</li>
            </ul>
            <button
              onClick={() => handleContactUpgrade('WhatsApp Pro')}
              className="btn-primary"
              style={{
                width: '100%',
                background: '#16A34A',
                borderColor: '#16A34A',
                fontSize: '13px',
                padding: '10px 0',
                justifyContent: 'center'
              }}
            >
              Choose WhatsApp Pro
            </button>
          </div>

          {/* Plan 2: Google Business Suite */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: targetSuite === 'gbp' ? '2px solid #2563EB' : '1px solid #E2E8F0',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>Google Booster</h3>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', minHeight: '36px' }}>
              Complete Google Business Profile reviews, AI responses, and Posts.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', fontSize: '12px', color: '#334155', flex: 1 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#1D4ED8" /> Real-time Review Sync</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#1D4ED8" /> AI-Powered Auto Replies</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#1D4ED8" /> GBP Promotional Posts</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Check size={14} color="#1D4ED8" /> Maps SEO & Performance</li>
            </ul>
            <button
              onClick={() => handleContactUpgrade('Google Booster')}
              className="btn-primary"
              style={{
                width: '100%',
                background: '#2563EB',
                borderColor: '#2563EB',
                fontSize: '13px',
                padding: '10px 0',
                justifyContent: 'center'
              }}
            >
              Choose Google Booster
            </button>
          </div>

          {/* Plan 3: Omnichannel Bundle (Recommended) */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '2px solid #8B5CF6',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxShadow: '0 10px 15px -3px rgba(139, 92, 246, 0.1)'
          }}>
            <div style={{
              position: 'absolute',
              top: '-11px',
              right: '16px',
              background: '#8B5CF6',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: '800',
              padding: '2px 8px',
              borderRadius: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Best Value
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EDE9FE', color: '#6D28D9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>Omnichannel Pro</h3>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', minHeight: '36px' }}>
              Unified growth engine combining WhatsApp automation and Google Reviews.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', fontSize: '12px', color: '#334155', flex: 1 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#6D28D9" /> <strong>Both Suites Included</strong></li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#6D28D9" /> Cross-Channel Flywheel</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Check size={14} color="#6D28D9" /> Auto Review Invite via WhatsApp</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Check size={14} color="#6D28D9" /> Dedicated Agency Support</li>
            </ul>
            <button
              onClick={() => handleContactUpgrade('Omnichannel Pro')}
              className="btn-primary"
              style={{
                width: '100%',
                background: '#7C3AED',
                borderColor: '#7C3AED',
                fontSize: '13px',
                padding: '10px 0',
                justifyContent: 'center',
                boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.3)'
              }}
            >
              Get Omnichannel Pro
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid #F1F5F9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
          color: '#64748B'
        }}>
          <span>Need custom multi-location agency wholesale pricing?</span>
          <button
            onClick={() => handleContactUpgrade('Enterprise Wholesale')}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#2563EB',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            Talk to an Enterprise Specialist <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
