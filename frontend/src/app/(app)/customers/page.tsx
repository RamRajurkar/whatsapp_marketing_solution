'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { formatIndianPhone } from '@/lib/phone';
import {
  Users, Search, Plus, Pencil, Trash2, UserPlus, Send,
  MessageSquare, FileText, Loader2, X,
} from 'lucide-react';

const TAG_COLORS: Record<string, string> = {
  'Regular Customer': '#DBEAFE',
  'VIP Customer': '#FEF3C7',
  'Vegetarian': '#D1FAE5',
  'Birthday Customer': '#FCE7F3',
  'Catering Inquiry': '#EDE9FE',
};

function Tag({ tag }: { tag: string }) {
  const bg = TAG_COLORS[tag] || '#f3f4f6';
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: bg, color: '#374151' }}>
      {tag}
    </span>
  );
}

function CustomerModal({ customer, onClose, onSave }: any) {
  const [form, setForm] = useState(customer || { name: '', phone: '', waId: '', tags: [], notes: '' });
  const PRESET_TAGS = ['Regular Customer', 'VIP Customer', 'Vegetarian', 'Birthday Customer', 'Catering Inquiry'];

  const toggleTag = (tag: string) => {
    setForm((f: any) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t: string) => t !== tag) : [...f.tags, tag],
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {customer ? <Pencil size={18} style={{ color: '#1B5E37' }} /> : <UserPlus size={18} style={{ color: '#1B5E37' }} />}
          {customer ? 'Edit Customer' : 'New Customer'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Full Name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Customer name" />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>WhatsApp Number *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ backgroundColor: '#f1f5f9', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: '600', fontSize: '14px' }}>+91</span>
              <input className="input-field" value={form.phone.startsWith('91') && form.phone.length >= 12 ? form.phone.substring(2) : form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, ''), waId: e.target.value.replace(/\D/g, '') })} placeholder="9876543210" style={{ flex: 1 }} maxLength={10} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '8px' }}>Tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              {PRESET_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)} style={{
                  padding: '6px 12px', borderRadius: '20px', border: '1.5px solid',
                  fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  fontWeight: '500', transition: 'all 0.15s',
                  background: form.tags.includes(tag) ? TAG_COLORS[tag] || '#e5e7eb' : 'white',
                  borderColor: form.tags.includes(tag) ? '#9ca3af' : '#e5e7eb',
                  color: '#374151',
                }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Notes</label>
            <textarea className="input-field" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this customer..." rows={3} style={{ resize: 'none', fontFamily: 'Inter, sans-serif' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)}>
            {customer ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}


function SendMessageModal({ customer, onClose }: { customer: any; onClose: () => void }) {
  const [mode, setMode] = useState<'text' | 'template'>('text');
  const [text, setText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateLang, setTemplateLang] = useState('en');
  const [sending, setSending] = useState(false);

  // Component parameter state
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [carouselCards, setCarouselCards] = useState<{ mediaUrl: string; bodyParams: string[] }[]>([]);

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/messaging/templates').then(r => r.data),
  });

  const templates = templatesData?.templates || [];

  // Get the currently selected template object
  const selectedTemplate = templates.find((t: any) => t.name === templateName);
  const selectedComponents: any[] = selectedTemplate?.components || [];

  // Derived info about what the template needs
  const headerComp = selectedComponents.find((c: any) => c.type === 'HEADER');
  const bodyComp = selectedComponents.find((c: any) => c.type === 'BODY');
  const carouselComp = selectedComponents.find((c: any) => c.type === 'CAROUSEL');

  const needsHeaderMedia = headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format);
  const bodyVarSlots = bodyComp?.text?.match(/\{\{\d+\}\}/g) || [];
  const needsBodyParams = bodyVarSlots.length > 0;

  // Handle template selection change
  const handleTemplateSelect = (name: string) => {
    const selected = templates.find((t: any) => t.name === name);
    setTemplateName(name);
    setHeaderMediaUrl('');
    setBodyParams([]);
    setCarouselCards([]);

    if (selected?.language) setTemplateLang(selected.language);
    if (selected?.components) {
      // Initialize body params array — auto-fill {{1}} with customer name
      const body = selected.components.find((c: any) => c.type === 'BODY');
      const vars = body?.text?.match(/\{\{\d+\}\}/g) || [];
      if (vars.length > 0) {
        const params = new Array(vars.length).fill('');
        if (customer?.name && customer.name !== 'Unknown') params[0] = customer.name;
        setBodyParams(params);
      }

      // Initialize carousel cards
      const carousel = selected.components.find((c: any) => c.type === 'CAROUSEL');
      if (carousel?.cards?.length) {
        setCarouselCards(
          carousel.cards.map((card: any) => {
            const cardBody = card.components?.find((c: any) => c.type === 'BODY');
            const cardVars = cardBody?.text?.match(/\{\{\d+\}\}/g) || [];
            return { mediaUrl: '', bodyParams: new Array(cardVars.length).fill('') };
          })
        );
      }
    }
  };

  const handleSend = async () => {
    if (mode === 'text' && !text.trim()) return;
    if (mode === 'template' && !templateName.trim()) return;

    // Validate required params
    if (mode === 'template' && needsHeaderMedia && !headerMediaUrl.trim()) {
      toast.error('Please provide the header media URL');
      return;
    }

    setSending(true);
    try {
      if (mode === 'text') {
        await api.post('/api/messaging/send-text', { phone: customer.phone, text: text.trim() });
        toast.success(`Message sent to ${customer.name}`);
      } else {
        await api.post('/api/messaging/send-template', {
          phone: customer.phone,
          templateName,
          templateLanguage: templateLang,
          templateComponents: selectedComponents.length > 0 ? selectedComponents : undefined,
          headerMediaUrl: headerMediaUrl.trim() || undefined,
          bodyParams: bodyParams.length > 0 ? bodyParams : undefined,
          carouselCards: carouselCards.length > 0 ? carouselCards : undefined,
        });
        toast.success(`Template sent to ${customer.name}`);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Send size={18} style={{ color: '#1B5E37' }} />
            Send to {customer.name}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#166534' }}>
          <strong>To:</strong> {formatIndianPhone(customer.phone)}
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px', background: '#f3f4f6', borderRadius: '10px', padding: '3px' }}>
          <button
            onClick={() => setMode('text')}
            style={{
              flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
              background: mode === 'text' ? 'white' : 'transparent',
              color: mode === 'text' ? '#1B5E37' : '#6b7280',
              boxShadow: mode === 'text' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            <MessageSquare size={14} /> Text Message
          </button>
          <button
            onClick={() => setMode('template')}
            style={{
              flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
              background: mode === 'template' ? 'white' : 'transparent',
              color: mode === 'template' ? '#1B5E37' : '#6b7280',
              boxShadow: mode === 'template' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            <FileText size={14} /> Template
          </button>
        </div>

        {mode === 'text' ? (
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Message</label>
            <textarea
              className="input-field"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              style={{ resize: 'none', fontFamily: 'Inter, sans-serif' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#9ca3af' }}>
              Note: Text messages can only be sent within the 24-hour customer service window.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Template</label>
              {templates.length > 0 ? (
                <select
                  className="input-field"
                  value={templateName}
                  onChange={e => handleTemplateSelect(e.target.value)}
                >
                  <option value="">Select a template...</option>
                  {templates.map((t: any) => (
                    <option key={t.name + t.language} value={t.name}>
                      {t.name} ({t.status})
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input-field" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="hello_world" />
              )}
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Language</label>
              <select className="input-field" value={templateLang} onChange={e => setTemplateLang(e.target.value)}>
                <option value="en">English</option>
                <option value="en_US">English (US)</option>
                <option value="hi">Hindi</option>
                <option value="ar">Arabic</option>
              </select>
            </div>

            {/* Header Media URL — shown when template has IMAGE/VIDEO/DOCUMENT header */}
            {needsHeaderMedia && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                  {headerComp.format === 'IMAGE' ? '🖼️ Header Image URL' : headerComp.format === 'VIDEO' ? '🎬 Header Video URL' : '📄 Header Document URL'}
                </label>
                <input
                  className="input-field"
                  value={headerMediaUrl}
                  onChange={e => setHeaderMediaUrl(e.target.value)}
                  placeholder={`https://example.com/media.${headerComp.format === 'IMAGE' ? 'jpg' : headerComp.format === 'VIDEO' ? 'mp4' : 'pdf'}`}
                />
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>
                  Public URL to the {headerComp.format.toLowerCase()} file
                </p>
              </div>
            )}

            {/* Body Variables — shown when template body has {{1}}, {{2}}, etc. */}
            {needsBodyParams && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                  📝 Body Variables
                </label>
                {bodyVarSlots.map((_: any, idx: number) => (
                  <div key={idx} style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', minWidth: '36px' }}>{`{{${idx + 1}}}`}</span>
                      <input
                        className="input-field"
                        value={bodyParams[idx] || ''}
                        onChange={e => {
                          const updated = [...bodyParams];
                          updated[idx] = e.target.value;
                          setBodyParams(updated);
                        }}
                        placeholder={`Value for {{${idx + 1}}}`}
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Carousel Cards — shown when template has CAROUSEL component */}
            {carouselComp && carouselCards.length > 0 && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                  🎠 Carousel Cards
                </label>
                {carouselCards.map((card, cardIdx) => {
                  const cardDef = carouselComp.cards?.[cardIdx];
                  const cardHeaderDef = cardDef?.components?.find((c: any) => c.type === 'HEADER');
                  const cardBodyDef = cardDef?.components?.find((c: any) => c.type === 'BODY');
                  const cardBodyVars = cardBodyDef?.text?.match(/\{\{\d+\}\}/g) || [];
                  return (
                    <div key={cardIdx} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Card {cardIdx + 1}</p>
                      {cardHeaderDef && ['IMAGE', 'VIDEO'].includes(cardHeaderDef.format) && (
                        <input
                          className="input-field"
                          value={card.mediaUrl}
                          onChange={e => {
                            const updated = [...carouselCards];
                            updated[cardIdx] = { ...updated[cardIdx], mediaUrl: e.target.value };
                            setCarouselCards(updated);
                          }}
                          placeholder={`Media URL for card ${cardIdx + 1}`}
                          style={{ marginBottom: '6px' }}
                        />
                      )}
                      {cardBodyVars.map((_: any, varIdx: number) => (
                        <div key={varIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#6b7280', minWidth: '30px' }}>{`{{${varIdx + 1}}}`}</span>
                          <input
                            className="input-field"
                            value={card.bodyParams[varIdx] || ''}
                            onChange={e => {
                              const updated = [...carouselCards];
                              const updatedParams = [...updated[cardIdx].bodyParams];
                              updatedParams[varIdx] = e.target.value;
                              updated[cardIdx] = { ...updated[cardIdx], bodyParams: updatedParams };
                              setCarouselCards(updated);
                            }}
                            placeholder={`Value for {{${varIdx + 1}}}`}
                            style={{ flex: 1 }}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{ margin: '0', fontSize: '11px', color: '#9ca3af' }}>
              Templates can be sent anytime — no 24-hour window restriction.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending} style={{ opacity: sending ? 0.6 : 1 }}>
            {sending ? <><Loader2 size={14} className="spin" /> Sending...</> : <><Send size={14} /> Send Message</>}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; customer?: any }>({ open: false });
  const [sendModal, setSendModal] = useState<{ open: boolean; customer?: any }>({ open: false });

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get(`/api/customers?search=${search}&limit=100`).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/customers', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); setModal({ open: false }); toast.success('Customer added!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.patch(`/api/customers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); setModal({ open: false }); toast.success('Customer updated!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/customers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); toast.success('Customer deleted'); },
  });

  const handleSave = (form: any) => {
    if (modal.customer) {
      updateMutation.mutate({ id: modal.customer._id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const customers = data?.customers || [];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Customers</h1>
            <p className="page-subtitle">{data?.total || 0} total customers</p>
          </div>
          <button className="btn-primary" onClick={() => setModal({ open: true })}>
            <Plus size={16} />
            Add Customer
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>
        {/* Search */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', marginBottom: '20px', border: '1px solid #e5e7eb', display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input className="input-field" style={{ paddingLeft: '36px' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." />
          </div>
        </div>

        {/* Table */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>WhatsApp Number</th>
                <th>Tags</th>
                <th>Last Seen</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6}><div className="skeleton" style={{ height: '14px', width: '100%' }} /></td>
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
                    <Users size={36} style={{ color: '#d1d5db', marginBottom: '8px' }} />
                    <div>No customers yet. Add your first customer to start messaging!</div>
                  </td>
                </tr>
              ) : (
                customers.map((c: any) => (
                  <tr key={c._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="avatar" style={{
                          width: '36px', height: '36px', fontSize: '14px',
                          background: '#E8F5E9', color: '#1B5E37',
                        }}>
                          {c.name?.[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontWeight: '600' }}>{c.name}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: '#1B5E37', fontWeight: '500', fontSize: '13px' }}>
                        {formatIndianPhone(c.phone)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {c.tags?.map((tag: string) => <Tag key={tag} tag={tag} />)}
                      </div>
                    </td>
                    <td style={{ color: '#6b7280', fontSize: '13px' }}>
                      {c.lastSeen ? format(new Date(c.lastSeen), 'MMM d, yyyy') : 'Never'}
                    </td>
                    <td style={{ color: '#6b7280', fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.notes || '-'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn-primary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => setSendModal({ open: true, customer: c })}
                        >
                          <Send size={12} />
                          Message
                        </button>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setModal({ open: true, customer: c })}>
                          <Pencil size={12} />
                          Edit
                        </button>
                        <button className="btn-danger" onClick={() => { if (confirm('Delete this customer?')) deleteMutation.mutate(c._id); }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal.open && (
        <CustomerModal
          customer={modal.customer}
          onClose={() => setModal({ open: false })}
          onSave={handleSave}
        />
      )}

      {sendModal.open && sendModal.customer && (
        <SendMessageModal
          customer={sendModal.customer}
          onClose={() => setSendModal({ open: false })}
        />
      )}
    </div>
  );
}
