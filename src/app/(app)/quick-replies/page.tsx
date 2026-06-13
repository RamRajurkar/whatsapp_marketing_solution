'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Zap, Copy, Check, Pencil, Trash2, Plus, ClipboardList } from 'lucide-react';

const CATEGORIES = ['General', 'Menu', 'Timings', 'Location', 'Reservations', 'Promotions'];
const DEFAULT_REPLIES = [
  { title: 'Menu', category: 'Menu', body: 'Here is our menu!\n\nWe serve a variety of dishes including appetizers, main courses, and desserts.\nFor the full menu, please visit our website or ask us to send the PDF menu.' },
  { title: 'Opening Hours', category: 'Timings', body: 'Our opening hours:\n\nMonday - Friday: 11:00 AM - 10:00 PM\nSaturday - Sunday: 10:00 AM - 11:00 PM\n\nWe look forward to welcoming you!' },
  { title: 'Location', category: 'Location', body: 'Find us here:\n\nAddress: [Your Restaurant Address]\n\nWe are located near [landmark]. Parking is available nearby.\n\nGoogle Maps: [link]' },
  { title: 'Reservation Instructions', category: 'Reservations', body: 'To make a reservation:\n\n1. Share your name\n2. Preferred date and time\n3. Number of guests\n4. Any special requirements\n\nWe will confirm your booking within minutes!' },
];

function QuickReplyCard({ reply, onEdit, onDelete }: any) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#1a1a2e' }}>{reply.title}</div>
          <span className="tag-pill" style={{ background: '#E8F5E9', color: '#1B5E37', marginTop: '4px' }}>{reply.category}</span>
        </div>
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>Used {reply.usageCount || 0}x</div>
      </div>
      <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: '1.6', whiteSpace: 'pre-line', background: '#FAFBFC', padding: '12px', borderRadius: '10px', border: '1px solid #f3f4f6' }}>{reply.body}</p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => { navigator.clipboard.writeText(reply.body); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success('Copied!'); }}
          style={{ padding: '6px 12px', background: '#E8F5E9', border: '1px solid #A7D5B8', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#1B5E37', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => onEdit(reply)}><Pencil size={12} /> Edit</button>
        <button className="btn-danger" onClick={() => onDelete(reply._id)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

function QuickReplyModal({ reply, onClose, onSave }: any) {
  const [form, setForm] = useState(reply || { title: '', body: '', category: 'General' });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {reply ? <Pencil size={18} style={{ color: '#1B5E37' }} /> : <Zap size={18} style={{ color: '#1B5E37' }} />}
          {reply ? 'Edit Quick Reply' : 'New Quick Reply'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Title *</label><input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Menu, Opening Hours..." /></div>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Category</label><select className="input-field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Message Body *</label><textarea className="input-field" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Enter your message template..." rows={6} style={{ resize: 'vertical', fontFamily: 'Inter, sans-serif' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(form)}>Save Reply</button></div>
      </div>
    </div>
  );
}

export default function QuickRepliesPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; reply?: any }>({ open: false });
  const [filterCat, setFilterCat] = useState('');
  const { data: replies, isLoading } = useQuery({ queryKey: ['quickReplies'], queryFn: () => api.get('/api/quick-replies').then(r => r.data) });
  const createMutation = useMutation({ mutationFn: (d: any) => api.post('/api/quick-replies', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quickReplies'] }); setModal({ open: false }); toast.success('Created!'); } });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: any) => api.patch(`/api/quick-replies/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quickReplies'] }); setModal({ open: false }); toast.success('Updated!'); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/api/quick-replies/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quickReplies'] }); toast.success('Deleted'); } });
  const seedDefaults = async () => { for (const r of DEFAULT_REPLIES) { await api.post('/api/quick-replies', r); } queryClient.invalidateQueries({ queryKey: ['quickReplies'] }); toast.success('Default replies added!'); };
  const filtered = (replies || []).filter((r: any) => !filterCat || r.category === filterCat);
  const handleSave = (form: any) => { if (modal.reply) updateMutation.mutate({ id: modal.reply._id, data: form }); else createMutation.mutate(form); };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div><h1 className="page-title">Quick Replies</h1><p className="page-subtitle">Reusable message templates for common queries</p></div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {(!replies || replies.length === 0) && <button className="btn-secondary" onClick={seedDefaults}><ClipboardList size={14} /> Load Defaults</button>}
            <button className="btn-primary" onClick={() => setModal({ open: true })}><Zap size={14} /> New Reply</button>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 32px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => setFilterCat('')} style={{ padding: '6px 16px', borderRadius: '20px', border: '1.5px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500', background: !filterCat ? '#1B5E37' : 'white', color: !filterCat ? 'white' : '#374151', borderColor: !filterCat ? '#1B5E37' : '#e5e7eb', transition: 'all 0.15s' }}>All</button>
          {CATEGORIES.map(cat => <button key={cat} onClick={() => setFilterCat(cat)} style={{ padding: '6px 16px', borderRadius: '20px', border: '1.5px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500', background: filterCat === cat ? '#1B5E37' : 'white', color: filterCat === cat ? 'white' : '#374151', borderColor: filterCat === cat ? '#1B5E37' : '#e5e7eb', transition: 'all 0.15s' }}>{cat}</button>)}
        </div>
        {isLoading ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: '200px', borderRadius: '16px' }} />)}</div>
        : filtered.length === 0 ? (<div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}><Zap size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} /><h3 style={{ margin: '0 0 8px', color: '#6b7280' }}>No quick replies yet</h3><p style={{ margin: '0 0 20px' }}>Create templates for common messages...</p><button className="btn-primary" onClick={seedDefaults}><ClipboardList size={14} /> Load Default Templates</button></div>)
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>{filtered.map((reply: any) => <QuickReplyCard key={reply._id} reply={reply} onEdit={(r: any) => setModal({ open: true, reply: r })} onDelete={(id: string) => { if (confirm('Delete?')) deleteMutation.mutate(id); }} />)}</div>}
      </div>
      {modal.open && <QuickReplyModal reply={modal.reply} onClose={() => setModal({ open: false })} onSave={handleSave} />}
    </div>
  );
}
