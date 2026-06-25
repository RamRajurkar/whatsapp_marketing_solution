'use client';

import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Play, Loader2, Smartphone, Send, MessageSquare } from 'lucide-react';

export function SimulatorPanel() {
  const [senderPhone, setSenderPhone] = useState('919876543210');
  const [senderName, setSenderName] = useState('Test User');
  const [messageText, setMessageText] = useState('hi');
  const [messageType, setMessageType] = useState<'text' | 'interactive'>('text');
  const [buttonId, setButtonId] = useState('btn_address');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const isDevMode = process.env.NODE_ENV === 'development';

  if (!isDevMode) return null;

  const handleSimulate = async () => {
    if (!senderPhone || !messageText) {
      toast.error('Please enter phone number and message');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const payload: any = {
        senderPhone,
        senderName,
        messageType,
      };

      if (messageType === 'text') {
        payload.messageText = messageText;
      } else {
        payload.buttonId = buttonId;
        payload.buttonTitle = buttonId === 'btn_address' ? '📍 Address' 
                            : buttonId === 'btn_menu' ? '📜 Menu' 
                            : '🕒 Timings';
      }

      const { data } = await api.post('/api/webhook/simulate', payload);
      setResult(data);
      toast.success('Simulation complete');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const quickMessages = [
    { label: '"hi"', val: 'hi' },
    { label: '"menu"', val: 'menu' },
    { label: '"help"', val: 'help' },
  ];

  return (
    <div className="glass-card" style={{ padding: '20px', marginTop: '24px', border: '1px solid #E5E7EB', background: '#FAFBFC' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Play size={18} style={{ color: '#F59E0B' }} />
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>Webhook Simulator (Dev Only)</h3>
      </div>
      
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
        Test bot logic and inbound message processing without connecting to Meta.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Sender Phone</label>
          <input
            type="text"
            className="input-field"
            value={senderPhone}
            onChange={(e) => setSenderPhone(e.target.value)}
          />
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Sender Name</label>
          <input
            type="text"
            className="input-field"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Message Type</label>
        <div style={{ display: 'flex', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
            <input 
              type="radio" 
              checked={messageType === 'text'} 
              onChange={() => setMessageType('text')} 
            /> Text
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
            <input 
              type="radio" 
              checked={messageType === 'interactive'} 
              onChange={() => setMessageType('interactive')} 
            /> Button Reply
          </label>
        </div>
      </div>

      {messageType === 'text' ? (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Message Text</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {quickMessages.map((qm) => (
                <button
                  key={qm.val}
                  onClick={() => setMessageText(qm.val)}
                  style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                    background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer', color: '#374151'
                  }}
                >
                  {qm.label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            className="input-field"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
          />
        </div>
      ) : (
        <div style={{ marginBottom: '20px' }}>
           <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Select Button Reply</label>
           <select 
              className="input-field"
              value={buttonId}
              onChange={(e) => setButtonId(e.target.value)}
            >
              <option value="btn_address">📍 Address</option>
              <option value="btn_menu">📜 Menu</option>
              <option value="btn_timings">🕒 Timings</option>
           </select>
        </div>
      )}

      <button
        onClick={handleSimulate}
        disabled={loading}
        className="btn-primary"
        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {loading ? 'Simulating...' : 'Simulate Webhook POST'}
      </button>

      {result && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#F3F4F6', borderRadius: '8px', fontSize: '12px' }}>
          <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1F2937' }}>Simulation Results:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#4B5563' }}>
            <div>• Messages Processed: {result.results.messages_processed}</div>
            <div>• Bot Replies Triggered: {result.results.bot_replies.length}</div>
            {result.results.bot_replies.map((reply: any, idx: number) => (
               <div key={idx} style={{ marginLeft: '12px', color: '#059669' }}>
                 ↳ Sent: "{reply.text}"
               </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
