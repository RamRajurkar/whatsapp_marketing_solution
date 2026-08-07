'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Zap, Copy, Check, Pencil, Trash2, Plus, ClipboardList, Link, Image, Smile, X } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

const DEFAULT_CATEGORIES = [
  'Catalogs & Samples',
  'Pricing & MOQ',
  'Fabric Specifications',
  'Order & Shipping',
  'Custom Manufacturing',
  'Payment & Terms',
  'General'
];

const DEFAULT_REPLIES = [
  {
    title: '📖 Share Fabric & Apparel Catalog',
    category: 'Catalogs & Samples',
    body: 'Hello! Here is our latest wholesale fabric & apparel catalog featuring our newest seasonal collection. You can browse all designs, GSM specifications, and shade cards here: {catalog_url}. Let us know which design codes you would like to order or inquire about!'
  },
  {
    title: '🧵 Swatch Card & Sample Book Request',
    category: 'Catalogs & Samples',
    body: 'We offer physical fabric sample swatches and hanger books for bulk buyers! Sample books are available for Rs 500 (100% refundable against your first bulk order). Kindly reply with your business address and GST number to dispatch your swatch card.'
  },
  {
    title: '💰 Wholesale Rates & MOQ Policy',
    category: 'Pricing & MOQ',
    body: 'Our standard Wholesale Minimum Order Quantity (MOQ) is 200 meters per fabric shade or 50 pieces per style code. Bulk tiered pricing discounts are applicable for orders above 1,000 meters / 200 pieces. Would you like a customized quotation?'
  },
  {
    title: '📊 Wholesale Price List & GST Terms',
    category: 'Pricing & MOQ',
    body: 'Our wholesale prices are quoted ex-factory (+ 5% GST and transport charges extra). Payment terms: 30% advance with order confirmation and balance 70% against LR dispatch copy.'
  },
  {
    title: '🧶 Fabric Quality & GSM Specs',
    category: 'Fabric Specifications',
    body: 'Fabric Technical Specifications:\n• Material: 100% Pure Combed Cotton / Premium Rayon Blend\n• GSM: 180 - 220 GSM\n• Width (Panna): 58 - 60 inches\n• Color Fastness: 100% Guaranteed (Reactive Dyeing)\n• Shrinkage: < 2% (Pre-shrunk)'
  },
  {
    title: '✂️ Custom Dyeing & Private Labeling (OEM)',
    category: 'Custom Manufacturing',
    body: 'We offer custom Pantone shade dyeing, rotary printing, digital printing, and custom label stitching for private brands! Custom dyeing MOQ is 500 meters per color with a turnaround time of 10-12 working days.'
  },
  {
    title: '🚚 Shipping, Logistics & Dispatch',
    category: 'Order & Shipping',
    body: 'Orders are dispatched via trusted logistics partners (V-Trans, TCI, SafeExpress, or your preferred local transport). Standard dispatch turnaround is 24-48 hours after payment receipt. Lorry Receipt (LR) tracking copy is shared immediately upon dispatch.'
  },
  {
    title: '🏦 Official Bank Account Details',
    category: 'Payment & Terms',
    body: 'Please find our official company bank account details below:\n• Account Name: Rathod Creation\n• Bank: HDFC Bank\n• A/C No: 50200012345678\n• IFSC Code: HDFC0001234\n• UPI ID: rathodcreation@hdfcbank\n\nPlease share the payment transfer screenshot for instant verification.'
  },
  {
    title: '🏷️ Private Branding & Custom Packaging',
    category: 'Custom Manufacturing',
    body: 'We provide full private label packaging solutions including woven main neck labels, wash care tags, barcode stickers, and custom printed poly-bags. Share your brand artwork/tech-pack to get started!'
  },
  {
    title: '📞 Wholesale Helpline & Assistance',
    category: 'General',
    body: 'Thank you for reaching out to Rathod Creation Wholesale! Our sales team is reviewing your query. You can also reach our direct wholesale desk at +91 98765 43210 for urgent order requests.'
  }
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
      {reply.mediaUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1B5E37' }}>
          <Image size={14} /> <span>Media attached</span>
        </div>
      )}
      {reply.links?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {reply.links.map((link: string, i: number) => (
            <a key={i} href={link} target="_blank" rel="noopener" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Link size={12} /> {link.length > 30 ? link.slice(0, 30) + '...' : link}
            </a>
          ))}
        </div>
      )}
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

function QuickReplyModal({ reply, onClose, onSave, categories }: any) {
  const [form, setForm] = useState(reply || { title: '', body: '', category: 'General', mediaUrl: '', links: [''] });
  const [showEmoji, setShowEmoji] = useState(false);

  const links = form.links || [''];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px', maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {reply ? <Pencil size={18} style={{ color: '#1B5E37' }} /> : <Zap size={18} style={{ color: '#1B5E37' }} />}
          {reply ? 'Edit Quick Reply' : 'New Quick Reply'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Title *</label><input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Menu, Opening Hours..." /></div>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Category</label><select className="input-field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map((c: string) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Message Body *</label>
            <textarea className="input-field" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Enter your message template..." rows={6} style={{ resize: 'vertical', fontFamily: 'Inter, sans-serif' }} />
            <button type="button" onClick={() => setShowEmoji(!showEmoji)} style={{ position: 'absolute', right: '8px', bottom: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <Smile size={18} style={{ color: showEmoji ? '#1B5E37' : '#9ca3af' }} />
            </button>
            {showEmoji && (
              <div style={{ position: 'absolute', right: 0, bottom: '40px', zIndex: 100 }}>
                <EmojiPicker onEmojiClick={(emojiData) => { setForm({ ...form, body: form.body + emojiData.emoji }); setShowEmoji(false); }} />
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
              <Image size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Media URL (optional)
            </label>
            <input className="input-field" value={form.mediaUrl || ''} onChange={e => setForm({ ...form, mediaUrl: e.target.value })} placeholder="https://example.com/image.jpg" />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Link size={14} /> Links
            </label>
            {links.map((link: string, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <input className="input-field" value={link} onChange={e => { const nl = [...links]; nl[i] = e.target.value; setForm({ ...form, links: nl }); }} placeholder="https://..." style={{ flex: 1 }} />
                {links.length > 1 && <button type="button" onClick={() => { const nl = links.filter((_: any, j: number) => j !== i); setForm({ ...form, links: nl }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}><X size={16} /></button>}
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, links: [...links, ''] })} style={{ fontSize: '12px', color: '#1B5E37', background: '#E8F5E9', border: '1px solid #A7D5B8', borderRadius: '8px', padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter, sans-serif', fontWeight: '500' }}>
              <Plus size={12} /> Add Link
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => { const cleanLinks = (form.links || []).filter((l: string) => l.trim()); onSave({ ...form, links: cleanLinks }); }}>Save Reply</button></div>
      </div>
    </div>
  );
}

export default function QuickRepliesPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; reply?: any }>({ open: false });
  const [filterCat, setFilterCat] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];

  const { data: replies, isLoading } = useQuery({ queryKey: ['quickReplies'], queryFn: () => api.get('/api/quick-replies').then(r => r.data) });
  const createMutation = useMutation({ mutationFn: (d: any) => api.post('/api/quick-replies', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quickReplies'] }); setModal({ open: false }); toast.success('Created!'); } });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: any) => api.patch(`/api/quick-replies/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quickReplies'] }); setModal({ open: false }); toast.success('Updated!'); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/api/quick-replies/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quickReplies'] }); toast.success('Deleted'); } });
  const seedDefaults = async () => {
    try {
      toast.loading('Loading Textile & Apparel templates...', { id: 'seed_toast' });
      await api.post('/api/quick-replies/seed-textile');
      queryClient.invalidateQueries({ queryKey: ['quickReplies'] });
      toast.success('Textile Industry Quick Replies loaded successfully!', { id: 'seed_toast' });
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to seed templates', { id: 'seed_toast' });
    }
  };
  const filtered = (replies || []).filter((r: any) => !filterCat || r.category === filterCat);
  const handleSave = (form: any) => { if (modal.reply) updateMutation.mutate({ id: modal.reply._id, data: form }); else createMutation.mutate(form); };

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (allCategories.includes(name)) { toast.error('Category already exists'); return; }
    setCustomCategories(prev => [...prev, name]);
    setNewCatName('');
    setShowAddCat(false);
    toast.success(`Category "${name}" added!`);
  };

  const handleDeleteCategory = (cat: string) => {
    if (DEFAULT_CATEGORIES.includes(cat)) { toast.error('Cannot delete default category'); return; }
    setCustomCategories(prev => prev.filter(c => c !== cat));
    if (filterCat === cat) setFilterCat('');
    toast.success(`Category "${cat}" removed`);
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div><h1 className="page-title">Quick Replies</h1><p className="page-subtitle">Reusable message templates for common queries</p></div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={seedDefaults} title="Add 10 Textile & Apparel Industry Quick Reply Templates"><ClipboardList size={14} /> Seed Textile Templates</button>
            <button className="btn-primary" onClick={() => setModal({ open: true })}><Zap size={14} /> New Reply</button>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 32px' }}>
        {/* Category filter bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setFilterCat('')} style={{ padding: '6px 16px', borderRadius: '20px', border: '1.5px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500', background: !filterCat ? '#1B5E37' : 'white', color: !filterCat ? 'white' : '#374151', borderColor: !filterCat ? '#1B5E37' : '#e5e7eb', transition: 'all 0.15s' }}>All</button>
          {allCategories.map(cat => (
            <div key={cat} style={{ position: 'relative', display: 'inline-flex' }}>
              <button onClick={() => setFilterCat(cat)} style={{ padding: '6px 16px', borderRadius: '20px', border: '1.5px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500', background: filterCat === cat ? '#1B5E37' : 'white', color: filterCat === cat ? 'white' : '#374151', borderColor: filterCat === cat ? '#1B5E37' : '#e5e7eb', transition: 'all 0.15s', paddingRight: customCategories.includes(cat) ? '28px' : '16px' }}>{cat}</button>
              {customCategories.includes(cat) && (
                <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: filterCat === cat ? 'rgba(255,255,255,0.7)' : '#d1d5db', fontSize: '10px' }} title="Delete category"><X size={12} /></button>
              )}
            </div>
          ))}
          {showAddCat ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input className="input-field" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} placeholder="Category name" style={{ width: '140px', padding: '6px 12px', fontSize: '13px' }} autoFocus />
              <button onClick={handleAddCategory} style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', background: '#1B5E37', color: 'white', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>Add</button>
              <button onClick={() => { setShowAddCat(false); setNewCatName(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px' }}><X size={16} /></button>
            </div>
          ) : (
            <button onClick={() => setShowAddCat(true)} style={{ padding: '6px 14px', borderRadius: '20px', border: '1.5px dashed #d1d5db', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500', background: 'white', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
              <Plus size={12} /> Add Category
            </button>
          )}
        </div>
        {isLoading ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: '200px', borderRadius: '16px' }} />)}</div>
        : filtered.length === 0 ? (<div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}><Zap size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} /><h3 style={{ margin: '0 0 8px', color: '#6b7280' }}>No quick replies yet</h3><p style={{ margin: '0 0 20px' }}>Create templates for common messages...</p><button className="btn-primary" onClick={seedDefaults}><ClipboardList size={14} /> Load Default Templates</button></div>)
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>{filtered.map((reply: any) => <QuickReplyCard key={reply._id} reply={reply} onEdit={(r: any) => setModal({ open: true, reply: r })} onDelete={(id: string) => { if (confirm('Delete?')) deleteMutation.mutate(id); }} />)}</div>}
      </div>
      {modal.open && <QuickReplyModal reply={modal.reply} onClose={() => setModal({ open: false })} onSave={handleSave} categories={allCategories} />}
    </div>
  );
}
