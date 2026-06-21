'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Megaphone, FileText, Clock, Send, CheckCircle2, XCircle,
  AlertTriangle, Trash2, Plus, Edit2, Loader2
} from 'lucide-react';

const STATUS_MAP = {
  draft: { label: 'Draft', class: 'badge-draft', icon: FileText },
  scheduled: { label: 'Scheduled', class: 'badge-scheduled', icon: Clock },
  sending: { label: 'Sending', class: 'badge-active', icon: Loader2 },
  sent: { label: 'Sent', class: 'badge-sent', icon: CheckCircle2 },
  failed: { label: 'Failed', class: 'badge-cancelled', icon: XCircle },
  partial: { label: 'Partial', class: 'badge-scheduled', icon: AlertTriangle },
};

function BroadcastModal({ broadcast, onClose, onSave }: any) {
  const [form, setForm] = useState(broadcast || {
    name: '', templateName: '', templateLanguage: 'en', audienceTags: [], scheduledAt: '',
  });
  const TAGS = ['Regular Customer', 'VIP Customer', 'Vegetarian', 'Birthday Customer', 'Catering Inquiry'];

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/messaging/templates').then(r => r.data)
  });

  const approvedTemplates = templatesData?.templates?.filter((t: any) => t.status === 'APPROVED') || [];

  const toggleTag = (tag: string) => {
    setForm((f: any) => ({
      ...f,
      audienceTags: f.audienceTags.includes(tag) ? f.audienceTags.filter((t: string) => t !== tag) : [...f.audienceTags, tag],
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Megaphone size={20} style={{ color: '#1B5E37' }} />
          {broadcast ? 'Edit Broadcast Campaign' : 'New Broadcast Campaign'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Campaign Name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Weekend Special Offer" />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Template Name *</label>
            <select
              className="input-field"
              value={form.templateName}
              onChange={e => {
                const selected = approvedTemplates.find((t: any) => t.name === e.target.value);
                setForm({ ...form, templateName: e.target.value, templateLanguage: selected ? selected.language : form.templateLanguage });
              }}
            >
              <option value="" disabled>Select a template</option>
              {templatesLoading ? (
                <option disabled>Loading templates...</option>
              ) : approvedTemplates.length > 0 ? (
                approvedTemplates.map((t: any) => (
                  <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                ))
              ) : (
                <option disabled>No approved templates found</option>
              )}
            </select>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>Must be a Meta-approved template. Create at: business.facebook.com/wa/manage/message-templates</p>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Language</label>
            <input 
              className="input-field" 
              value={form.templateLanguage} 
              onChange={e => setForm({ ...form, templateLanguage: e.target.value })}
              placeholder="e.g. en_US" 
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '8px' }}>
              Target Audience <span style={{ color: '#9ca3af', fontWeight: '400' }}>(leave empty to send to all customers)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)} style={{
                  padding: '6px 12px', borderRadius: '20px', border: '1.5px solid', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500', transition: 'all 0.15s',
                  background: form.audienceTags.includes(tag) ? '#1B5E37' : 'white',
                  color: form.audienceTags.includes(tag) ? 'white' : '#374151',
                  borderColor: form.audienceTags.includes(tag) ? '#1B5E37' : '#e5e7eb',
                }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Schedule (optional)</label>
            <input className="input-field" type="datetime-local" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)}>{broadcast ? 'Save Changes' : 'Create Campaign'}</button>
        </div>
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<any>(null);
  const [progressMap, setProgressMap] = useState<Record<string, any>>({});

  const { data: broadcasts, isLoading } = useQuery({
    queryKey: ['broadcasts'],
    queryFn: () => api.get('/api/broadcasts').then(r => r.data),
  });

  // Socket.IO for real-time broadcast progress
  useEffect(() => {
    const socket = getSocket();
    socket.emit('join:broadcasts');

    const handleProgress = (data: any) => {
      setProgressMap(prev => ({ ...prev, [data.broadcastId]: data }));
      // If broadcast finished, refresh the list
      if (data.status && data.status !== 'sending') {
        queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      }
    };

    socket.on('broadcast:progress', handleProgress);

    return () => {
      socket.off('broadcast:progress', handleProgress);
      socket.emit('leave:broadcasts');
    };
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/api/broadcasts', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); setModal(null); toast.success('Campaign created!'); },
  });

  const updateMutation = useMutation({
    mutationFn: (d: any) => api.put(`/api/broadcasts/${d._id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); setModal(null); toast.success('Campaign updated!'); },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/broadcasts/${id}/send`),
    onSuccess: (_, id) => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); toast.success('Broadcast started!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to send'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/broadcasts/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); toast.success('Deleted'); },
  });

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Broadcast Campaigns</h1>
            <p className="page-subtitle">Send promotional messages to your customers</p>
          </div>
          <button className="btn-primary" onClick={() => setModal('new')}>
            <Plus size={16} />
            New Campaign
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>
        {/* Info banner */}
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ color: '#B45309', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong style={{ fontSize: '13px', color: '#92400E' }}>Meta Template Requirement</strong>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#B45309' }}>
              Broadcasts can only use Meta-approved message templates. Create and approve templates at{' '}
              <a href="https://business.facebook.com/wa/manage/message-templates" target="_blank" rel="noopener noreferrer" style={{ color: '#1B5E37' }}>
                Meta Business Manager
              </a>
            </p>
          </div>
        </div>

        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Template</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Stats</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={7}><div className="skeleton" style={{ height: '14px' }} /></td></tr>
                ))
              ) : !broadcasts?.length ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
                    <Megaphone size={36} style={{ color: '#d1d5db', marginBottom: '8px' }} />
                    <div>No campaigns yet. Create your first broadcast!</div>
                  </td>
                </tr>
              ) : (
                broadcasts.map((b: any) => {
                  const sc = STATUS_MAP[b.status as keyof typeof STATUS_MAP] || STATUS_MAP.draft;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={b._id}>
                      <td><div style={{ fontWeight: '600', fontSize: '14px' }}>{b.name}</div></td>
                      <td><code style={{ fontSize: '12px', background: '#f3f4f6', padding: '3px 8px', borderRadius: '6px' }}>{b.templateName}</code></td>
                      <td>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {b.audienceTags?.length > 0 ? b.audienceTags.join(', ') : 'All Customers'}
                        </div>
                      </td>
                      <td>
                        <span className={sc.class} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <StatusIcon size={12} />
                          {sc.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {(() => {
                            const progress = progressMap[b._id];
                            const isSending = b.status === 'sending' || progress?.status === 'sending';
                            const sent = progress?.sent ?? b.stats?.sent ?? 0;
                            const failed = progress?.failed ?? b.stats?.failed ?? 0;
                            const total = progress?.total ?? b.stats?.total ?? 0;
                            const pct = total > 0 ? Math.round((sent + failed) / total * 100) : 0;

                            if (isSending && total > 0) {
                              return (
                                <div style={{ minWidth: '140px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', fontWeight: '600' }}>
                                    <span style={{ color: '#1B5E37' }}>{sent} sent</span>
                                    <span style={{ color: '#6b7280' }}>{pct}%</span>
                                  </div>
                                  <div style={{ width: '100%', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${pct}%`,
                                      height: '100%',
                                      background: 'linear-gradient(90deg, #1B5E37, #22C55E)',
                                      borderRadius: '3px',
                                      transition: 'width 0.5s ease',
                                    }} />
                                  </div>
                                  {failed > 0 && (
                                    <div style={{ fontSize: '10px', color: '#EF4444', marginTop: '2px' }}>{failed} failed</div>
                                  )}
                                </div>
                              );
                            }

                            return total > 0 ? (
                              <><CheckCircle2 size={12} style={{ color: '#22C55E', display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{sent} / {total}</>
                            ) : '—';
                          })()}
                        </div>
                      </td>
                      <td style={{ color: '#6b7280', fontSize: '12px' }}>
                        {format(new Date(b.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {b.status === 'draft' && (
                            <>
                              <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setModal(b)}>
                                <Edit2 size={12} />
                              </button>
                              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => { if (confirm(`Send to ${b.audienceTags?.join(', ') || 'all customers'}? This will send WhatsApp messages.`)) sendMutation.mutate(b._id); }}>
                                <Send size={12} />
                                Send
                              </button>
                            </>
                          )}
                          <button className="btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(b._id); }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <BroadcastModal 
          broadcast={modal === 'new' ? null : modal} 
          onClose={() => setModal(null)} 
          onSave={(form: any) => {
            if (form._id) {
              updateMutation.mutate(form);
            } else {
              createMutation.mutate({ ...form, status: 'draft' });
            }
          }} 
        />
      )}
    </div>
  );
}
