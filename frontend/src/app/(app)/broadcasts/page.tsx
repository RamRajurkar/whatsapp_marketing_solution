'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, getDay } from 'date-fns';
import {
  Megaphone, FileText, Clock, Send, CheckCircle2, XCircle,
  AlertTriangle, Trash2, Plus, Edit2, Loader2, Calendar, ChevronLeft, ChevronRight, X, Image as ImageIcon, Upload
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const STATUS_MAP = {
  draft: { label: 'Draft', class: 'badge-draft', icon: FileText, color: '#6b7280' },
  scheduled: { label: 'Scheduled', class: 'badge-scheduled', icon: Clock, color: '#f59e0b' },
  sending: { label: 'Sending', class: 'badge-active', icon: Loader2, color: '#3b82f6' },
  sent: { label: 'Sent', class: 'badge-sent', icon: CheckCircle2, color: '#22c55e' },
  failed: { label: 'Failed', class: 'badge-cancelled', icon: XCircle, color: '#ef4444' },
  partial: { label: 'Partial', class: 'badge-scheduled', icon: AlertTriangle, color: '#f59e0b' },
};

function BroadcastCalendar({ broadcasts, onDayClick }: { broadcasts: any[]; onDayClick: (date: Date) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart); // 0=Sun

  const broadcastsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    broadcasts?.forEach((b: any) => {
      const dateKey = b.scheduledAt
        ? format(new Date(b.scheduledAt), 'yyyy-MM-dd')
        : format(new Date(b.createdAt), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(b);
    });
    return map;
  }, [broadcasts]);

  return (
    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Calendar size={20} style={{ color: '#1B5E37' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1a1a2e' }}>Broadcast Calendar</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ChevronLeft size={18} color="#374151" />
          </button>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e', minWidth: '140px', textAlign: 'center' }}>
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ChevronRight size={18} color="#374151" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: '600', color: '#9ca3af', padding: '6px 0' }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {/* Padding for start of month */}
        {Array(startPadding).fill(null).map((_, i) => (
          <div key={`pad-${i}`} style={{ minHeight: '60px' }} />
        ))}

        {daysInMonth.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayBroadcasts = broadcastsByDate[dateKey] || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateKey}
              onClick={() => dayBroadcasts.length > 0 && onDayClick(day)}
              style={{
                minHeight: '60px',
                padding: '4px',
                borderRadius: '8px',
                border: isToday ? '2px solid #1B5E37' : '1px solid #f3f4f6',
                background: isToday ? '#f0fdf4' : dayBroadcasts.length > 0 ? '#fafafa' : 'transparent',
                cursor: dayBroadcasts.length > 0 ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                fontSize: '12px',
                fontWeight: isToday ? '700' : '500',
                color: isToday ? '#1B5E37' : '#374151',
                marginBottom: '2px',
              }}>
                {format(day, 'd')}
              </div>
              {dayBroadcasts.slice(0, 2).map((b: any) => {
                const sc = STATUS_MAP[b.status as keyof typeof STATUS_MAP] || STATUS_MAP.draft;
                return (
                  <div key={b._id} style={{
                    fontSize: '9px',
                    fontWeight: '600',
                    color: 'white',
                    background: sc.color,
                    borderRadius: '4px',
                    padding: '1px 4px',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {b.name}
                  </div>
                );
              })}
              {dayBroadcasts.length > 2 && (
                <div style={{ fontSize: '9px', color: '#6b7280', fontWeight: '600' }}>+{dayBroadcasts.length - 2} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BroadcastModal({ broadcast, onClose, onSave }: any) {
  const [form, setForm] = useState(broadcast || {
    name: '', templateName: '', templateLanguage: 'en', audienceTags: [], scheduledAt: '',
    headerMediaUrl: '', headerMediaId: '', bodyParams: [], carouselCards: [],
  });
  const TAGS = ['Regular Customer', 'VIP Customer', 'Vegetarian', 'Birthday Customer', 'Catering Inquiry'];

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/messaging/templates').then(r => r.data)
  });

  const { data: mediaData } = useQuery({
    queryKey: ['media'],
    queryFn: () => api.get('/api/media').then(r => r.data),
  });

  const approvedTemplates = templatesData?.templates?.filter((t: any) => t.status === 'APPROVED') || [];
  const mediaList = mediaData?.media || [];

  // Get selected template details
  const selectedTemplate = approvedTemplates.find((t: any) => t.name === form.templateName);
  const selectedComponents: any[] = selectedTemplate?.components || [];
  const headerComp = selectedComponents.find((c: any) => c.type === 'HEADER');
  const bodyComp = selectedComponents.find((c: any) => c.type === 'BODY');
  const carouselComp = selectedComponents.find((c: any) => c.type === 'CAROUSEL');

  const needsHeaderMedia = headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format);
  const bodyVarSlots = bodyComp?.text?.match(/\{\{\d+\}\}/g) || [];
  const needsBodyParams = bodyVarSlots.length > 0;

  const handleTemplateSelect = (name: string) => {
    const selected = approvedTemplates.find((t: any) => t.name === name);
    const updatedForm = {
      ...form,
      templateName: name,
      templateLanguage: selected?.language || form.templateLanguage,
      headerMediaUrl: '',
      headerMediaId: '',
      bodyParams: [],
      carouselCards: [],
    };

    if (selected?.components) {
      const body = selected.components.find((c: any) => c.type === 'BODY');
      const vars = body?.text?.match(/\{\{\d+\}\}/g) || [];
      if (vars.length > 0) updatedForm.bodyParams = new Array(vars.length).fill('');

      const carousel = selected.components.find((c: any) => c.type === 'CAROUSEL');
      if (carousel?.cards?.length) {
        updatedForm.carouselCards = carousel.cards.map((card: any) => {
          const cardBody = card.components?.find((c: any) => c.type === 'BODY');
          const cardVars = cardBody?.text?.match(/\{\{\d+\}\}/g) || [];
          return { mediaUrl: '', bodyParams: new Array(cardVars.length).fill('') };
        });
      }
    }

    setForm(updatedForm);
  };

  const toggleTag = (tag: string) => {
    setForm((f: any) => ({
      ...f,
      audienceTags: f.audienceTags.includes(tag) ? f.audienceTags.filter((t: string) => t !== tag) : [...f.audienceTags, tag],
    }));
  };

  const handleSave = () => {
    const saveData = {
      ...form,
      templateComponents: selectedComponents.length > 0 ? selectedComponents : undefined,
    };
    onSave(saveData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Megaphone size={20} style={{ color: '#1B5E37' }} />
            {broadcast ? 'Edit Broadcast Campaign' : 'New Broadcast Campaign'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Campaign Name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Weekend Special Offer" />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Template Name *</label>
            <select
              className="input-field"
              style={{ padding: '10px 14px', fontSize: '14px', backgroundColor: '#f9fafb', cursor: 'pointer' }}
              value={form.templateName}
              onChange={e => handleTemplateSelect(e.target.value)}
            >
              <option value="" disabled>✨ Select a template</option>
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

          {/* Header Media Section */}
          {needsHeaderMedia && (
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                {headerComp.format === 'IMAGE' ? '🖼️ Header Image' : headerComp.format === 'VIDEO' ? '🎬 Header Video' : '📄 Header Document'}
              </label>
              
              {/* Media Library Selection */}
              {headerComp.format === 'IMAGE' && mediaList.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    <ImageIcon size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    Select from Media Library
                  </label>
                  <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }}>
                    {mediaList.map((m: any) => {
                      const fullUrl = m.url.startsWith('http') ? m.url : `${API_BASE}${m.url}`;
                      const isSelected = form.headerMediaUrl === fullUrl;
                      return (
                        <div 
                          key={m._id} 
                          onClick={() => setForm({ ...form, headerMediaUrl: fullUrl })}
                          style={{ 
                            width: '80px', height: '80px', flexShrink: 0, borderRadius: '8px', cursor: 'pointer',
                            border: isSelected ? '3px solid #22c55e' : '1px solid #e2e8f0',
                            backgroundImage: `url(${fullUrl})`,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                            opacity: isSelected ? 1 : 0.7, transition: 'all 0.2s',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', margin: '8px 0' }}>— OR paste a public URL —</div>

              <div>
                <input
                  className="input-field"
                  value={form.headerMediaUrl}
                  onChange={e => setForm({ ...form, headerMediaUrl: e.target.value })}
                  placeholder={`https://example.com/media.${headerComp.format === 'IMAGE' ? 'jpg' : headerComp.format === 'VIDEO' ? 'mp4' : 'pdf'}`}
                />
              </div>
            </div>
          )}

          {/* Body Params Section */}
          {needsBodyParams && (
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>📝 Body Variables</label>
              {bodyVarSlots.map((_: any, idx: number) => (
                <div key={idx} style={{ marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', minWidth: '36px' }}>{`{{${idx + 1}}}`}</span>
                    <input
                      className="input-field"
                      value={form.bodyParams?.[idx] || ''}
                      onChange={e => {
                        const updated = [...(form.bodyParams || [])];
                        updated[idx] = e.target.value;
                        setForm({ ...form, bodyParams: updated });
                      }}
                      placeholder={`Value for {{${idx + 1}}}`}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Carousel Cards Section */}
          {carouselComp && form.carouselCards?.length > 0 && (
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>🎠 Carousel Cards</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {form.carouselCards.map((card: any, idx: number) => (
                  <div key={idx} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Card {idx + 1}</div>
                    <input
                      className="input-field"
                      placeholder="Header Media URL (Optional)"
                      value={card.mediaUrl}
                      onChange={e => {
                        const updated = [...form.carouselCards];
                        updated[idx] = { ...updated[idx], mediaUrl: e.target.value };
                        setForm({ ...form, carouselCards: updated });
                      }}
                      style={{ marginBottom: '8px', fontSize: '13px' }}
                    />
                    {card.bodyParams?.map((_: any, pIdx: number) => (
                      <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>{`{{${pIdx + 1}}}`}</span>
                        <input
                          className="input-field"
                          placeholder={`Variable ${pIdx + 1}`}
                          value={card.bodyParams[pIdx] || ''}
                          onChange={e => {
                            const updated = [...form.carouselCards];
                            const updatedParams = [...updated[idx].bodyParams];
                            updatedParams[pIdx] = e.target.value;
                            updated[idx] = { ...updated[idx], bodyParams: updatedParams };
                            setForm({ ...form, carouselCards: updated });
                          }}
                          style={{ fontSize: '13px', padding: '6px 10px' }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

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
          <button className="btn-primary" onClick={handleSave}>{broadcast ? 'Save Changes' : 'Create Campaign'}</button>
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

  const handleDayClick = (date: Date) => {
    // Scroll to table — could also filter, but for now just a visual cue
    const tableEl = document.getElementById('broadcasts-table');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
  };

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
        {/* Broadcast Calendar */}
        {!isLoading && broadcasts?.length > 0 && (
          <BroadcastCalendar broadcasts={broadcasts} onDayClick={handleDayClick} />
        )}

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

        <div id="broadcasts-table" className="glass-card" style={{ overflow: 'hidden' }}>
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
