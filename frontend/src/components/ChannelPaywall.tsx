'use client';

import React, { useState } from 'react';
import { Lock, Sparkles, ArrowRight, ShieldAlert } from 'lucide-react';
import { UpgradePlanModal } from './UpgradePlanModal';

interface ChannelPaywallProps {
  channelName: string;
  channelKey: 'whatsapp' | 'gbp';
  description?: string;
  features?: string[];
}

export function ChannelPaywall({
  channelName,
  channelKey,
  description,
  features
}: ChannelPaywallProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const defaultFeatures = channelKey === 'gbp' ? [
    'Live Google Business Profile review synchronization',
    'AI-powered 1-click sentiment replies',
    'GBP promotional offers and product posts',
    'Local Maps ranking and engagement analytics'
  ] : [
    'Official Meta WhatsApp Cloud API messaging',
    'Automated 24/7 visual chatbot builder',
    'Targeted bulk broadcast campaigns with template approval',
    'Interactive catalogs and instant ordering'
  ];

  const displayFeatures = features || defaultFeatures;

  return (
    <div style={{
      padding: '40px 24px',
      maxWidth: '720px',
      margin: '40px auto',
      textAlign: 'center'
    }}>
      <div className="glass-card" style={{
        padding: '48px 36px',
        borderRadius: '20px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Lock Icon Badge */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: channelKey === 'gbp' ? '#EFF6FF' : '#DCFCE7',
          color: channelKey === 'gbp' ? '#2563EB' : '#166534',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)'
        }}>
          <Lock size={30} />
        </div>

        <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0F172A', margin: '0 0 10px' }}>
          {channelName} is Not Included in Your Current Plan
        </h2>

        <p style={{ fontSize: '15px', color: '#64748B', maxWidth: '520px', margin: '0 auto 28px', lineHeight: '1.6' }}>
          {description || `Your subscription is currently scoped without the ${channelName} channel module. Upgrade your subscription tier to unlock instant access.`}
        </p>

        {/* Feature List */}
        <div style={{
          background: '#F8FAFC',
          borderRadius: '12px',
          padding: '20px 24px',
          margin: '0 auto 32px',
          textAlign: 'left',
          maxWidth: '520px',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            What you will get:
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {displayFeatures.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1E293B' }}>
                <Sparkles size={16} color={channelKey === 'gbp' ? '#2563EB' : '#16A34A'} />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => setModalOpen(true)}
          className="btn-primary"
          style={{
            padding: '12px 28px',
            fontSize: '15px',
            fontWeight: '700',
            borderRadius: '10px',
            background: channelKey === 'gbp' ? '#2563EB' : '#16A34A',
            borderColor: channelKey === 'gbp' ? '#2563EB' : '#16A34A',
            margin: '0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
          }}
        >
          <span>Upgrade to Unlock {channelName}</span>
          <ArrowRight size={16} />
        </button>
      </div>

      <UpgradePlanModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        targetSuite={channelKey}
      />
    </div>
  );
}
