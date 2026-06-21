'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { formatIndianPhone } from '@/lib/phone';
import {
  MessageSquare, Search, User, CalendarDays, Zap, Paperclip,
  Send, Loader2, Image, FileText, Check, CheckCheck,
  Inbox as InboxIcon, Hand, Plus, X, AlertCircle, Clock, Smile,
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

const AVATAR_COLORS = [
  ['#D1FAE5', '#166534'], ['#DBEAFE', '#1E40AF'], ['#FCE7F3', '#9D174D'],
  ['#FEF3C7', '#92400E'], ['#EDE9FE', '#5B21B6'], ['#FEE2E2', '#991B1B'],
];

function getAvatarColor(name: string) {
  const idx = (name?.charCodeAt(0) || 65) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}


function NewConversationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (convId: string) => void }) {
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!phone.trim() || !text.trim()) return;
    setSending(true);
    try {
      const resp = await api.post('/api/messaging/send-text', {
        phone: phone.trim().replace('+', '').replace(/\s/g, ''),
        text: text.trim(),
      });
      toast.success('Message sent!');
      onCreated(resp.data.conversationId);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={18} style={{ color: '#1B5E37' }} />
            New Conversation
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>WhatsApp Number *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ backgroundColor: '#f1f5f9', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: '600', fontSize: '14px' }}>+91</span>
              <input className="input-field" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="9876543210" style={{ flex: 1 }} maxLength={10} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Message *</label>
            <textarea className="input-field" value={text} onChange={e => setText(e.target.value)} placeholder="Type your first message..." rows={3} style={{ resize: 'none', fontFamily: 'Inter, sans-serif' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending || !phone.trim() || !text.trim()} style={{ opacity: (sending || !phone.trim() || !text.trim()) ? 0.6 : 1 }}>
            {sending ? <><Loader2 size={14} /> Sending...</> : <><Send size={14} /> Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}


function SendTemplateModal({ conversationId, phone, customerName, onClose }: { conversationId: string; phone: string; customerName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [templateName, setTemplateName] = useState('');
  const [templateLang, setTemplateLang] = useState('en_US');
  const [templateText, setTemplateText] = useState('');
  const [sending, setSending] = useState(false);

  // Component parameter state
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);
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
    setTemplateText('');
    setHeaderMediaUrl('');
    setHeaderMediaFile(null);
    setBodyParams([]);
    setCarouselCards([]);

    if (selected?.language) setTemplateLang(selected.language);
    if (selected?.components) {
      const body = selected.components.find((c: any) => c.type === 'BODY');
      if (body?.text) setTemplateText(body.text);

      // Initialize body params array — auto-fill {{1}} with customer name
      const vars = body?.text?.match(/\{\{\d+\}\}/g) || [];
      if (vars.length > 0) {
        const params = new Array(vars.length).fill('');
        if (customerName && customerName !== 'Unknown') params[0] = customerName;
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
    if (!templateName.trim()) return;
    // Validate required params
    if (needsHeaderMedia && !headerMediaUrl.trim() && !headerMediaFile) {
      toast.error('Please provide the header media URL or upload a file');
      return;
    }
    if (needsHeaderMedia && headerMediaUrl.trim().startsWith('data:')) {
      toast.error('Please provide a public link (http:// or https://), not a pasted image / Base64 data.');
      return;
    }
    setSending(true);
    try {
      let headerMediaId = undefined;
      
      // Upload file if selected
      if (headerMediaFile) {
        const formData = new FormData();
        formData.append('file', headerMediaFile);
        const uploadResp = await api.post('/api/messaging/upload-media', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        headerMediaId = uploadResp.data.id;
      }

      await api.post(`/api/conversations/${conversationId}/send-template`, {
        templateName,
        templateLanguage: templateLang,
        templateText,
        templateComponents: selectedComponents.length > 0 ? selectedComponents : undefined,
        headerMediaUrl: headerMediaUrl.trim() || undefined,
        headerMediaId: headerMediaId,
        bodyParams: bodyParams.length > 0 ? bodyParams : undefined,
        carouselCards: carouselCards.length > 0 ? carouselCards : undefined,
      });
      toast.success('Template sent!');
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send template');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} style={{ color: '#1B5E37' }} />
            Send Template
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#166534' }}>
          <strong>To:</strong> {formatIndianPhone(phone)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Template</label>
            {templates.length > 0 ? (
              <select className="input-field" value={templateName} onChange={e => handleTemplateSelect(e.target.value)}>
                <option value="">Select a template...</option>
                {templates.map((t: any) => (
                  <option key={t.name + t.language} value={t.name}>{t.name} ({t.status})</option>
                ))}
              </select>
            ) : (
              <input className="input-field" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="hello_world" />
            )}
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Language</label>
            <select className="input-field" value={templateLang} onChange={e => setTemplateLang(e.target.value)}>
              <option value="en_US">English (US)</option>
              <option value="en">English</option>
              <option value="en_GB">English (UK)</option>
              <option value="hi">Hindi</option>
              <option value="ar">Arabic</option>
            </select>
          </div>

          {/* Header Media URL — shown when template has IMAGE/VIDEO/DOCUMENT header */}
          {needsHeaderMedia && (
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '10px' }}>
                {headerComp.format === 'IMAGE' ? '🖼️ Header Image' : headerComp.format === 'VIDEO' ? '🎬 Header Video' : '📄 Header Document'}
              </label>
              
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Upload File (Recommended)</label>
                <input 
                  type="file" 
                  className="input-field" 
                  style={{ padding: '8px' }}
                  onChange={e => {
                    if (e.target.files?.[0]) {
                      setHeaderMediaFile(e.target.files[0]);
                      setHeaderMediaUrl(''); // Clear URL if file selected
                    }
                  }} 
                  accept={headerComp.format === 'IMAGE' ? 'image/*' : headerComp.format === 'VIDEO' ? 'video/*' : '*/*'}
                />
              </div>
              
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', margin: '8px 0' }}>— OR —</div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Paste Public URL</label>
                <input
                  className="input-field"
                  value={headerMediaUrl}
                  onChange={e => {
                    setHeaderMediaUrl(e.target.value);
                    if (e.target.value) setHeaderMediaFile(null); // Clear file if URL entered
                  }}
                  placeholder={`https://example.com/media.${headerComp.format === 'IMAGE' ? 'jpg' : headerComp.format === 'VIDEO' ? 'mp4' : 'pdf'}`}
                />
              </div>
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

          <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>
            Templates can be sent anytime. Use them to re-open conversations outside the 24-hour window.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending || !templateName.trim()} style={{ opacity: (sending || !templateName.trim()) ? 0.6 : 1 }}>
            {sending ? <><Loader2 size={14} /> Sending...</> : <><Send size={14} /> Send Template</>}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function InboxPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(searchParams.get('id'));
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [newConvModal, setNewConvModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ['conversations', search],
    queryFn: () => api.get(`/api/conversations?search=${search}&limit=100`).then(r => r.data),
    refetchInterval: 15000,
  });
  const { data: messagesData, isLoading: msgLoading } = useQuery({
    queryKey: ['messages', selectedConvId],
    queryFn: () => api.get(`/api/conversations/${selectedConvId}/messages`).then(r => r.data),
    enabled: !!selectedConvId, refetchInterval: false,
  });
  const { data: quickReplies } = useQuery({
    queryKey: ['quickReplies'],
    queryFn: () => api.get('/api/quick-replies').then(r => r.data),
  });
  const sendText = useMutation({
    mutationFn: (text: string) => api.post(`/api/conversations/${selectedConvId}/send-text`, { text }),
    onSuccess: () => {
      setMessageText('');
      queryClient.refetchQueries({ queryKey: ['messages', selectedConvId] });
      queryClient.refetchQueries({ queryKey: ['conversations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send'),
  });

  useEffect(() => {
    const socket = getSocket();
    socket.on('message:new', (msg: any) => { queryClient.invalidateQueries({ queryKey: ['messages', msg.conversationId] }); queryClient.invalidateQueries({ queryKey: ['conversations'] }); });
    socket.on('conversation:updated', () => { queryClient.invalidateQueries({ queryKey: ['conversations'] }); });
    return () => { socket.off('message:new'); socket.off('conversation:updated'); };
  }, [queryClient]);

  useEffect(() => { if (selectedConvId) { getSocket().emit('join:conversation', selectedConvId); } }, [selectedConvId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messagesData]);

  const selectedConv = convData?.conversations?.find((c: any) => c._id === selectedConvId);
  const messages = messagesData?.messages || [];
  const conversations = convData?.conversations || [];
  const handleSend = (e: React.FormEvent) => { e.preventDefault(); if (!messageText.trim() || !selectedConvId) return; sendText.mutate(messageText.trim()); };
  
  const safeDate = (ts: string) => {
    if (!ts) return new Date();
    // If string lacks a timezone offset (+00:00, -05:00, or Z), append Z so browser treats it as UTC
    return new Date(ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z');
  };

  const getMessageTime = (ts: string) => { try { return format(safeDate(ts), 'HH:mm'); } catch { return ''; } };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh / 1.1 - 68px)', overflow: 'hidden' }}>
      {/* Chat List */}
      <div style={{ width: '340px', borderRight: '1px solid #374151', background: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 10 }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #374151' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={20} style={{ color: '#1B5E37' }} /> Inbox
            </h2>
            <button
              className="btn-primary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setNewConvModal(true)}
            >
              <Plus size={14} /> New
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." className="input-field" style={{ paddingLeft: '36px' }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convLoading ? Array(6).fill(0).map((_, i) => (
            <div key={i} style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div className="skeleton" style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}><div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '8px' }} /><div className="skeleton" style={{ height: '12px', width: '80%' }} /></div>
            </div>
          )) : conversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: '#9ca3af', fontSize: '14px' }}>
              <InboxIcon size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} />
              <div>No conversations yet.</div>
              <button className="btn-primary" style={{ marginTop: '16px', padding: '8px 16px', fontSize: '13px' }} onClick={() => setNewConvModal(true)}>
                <Plus size={14} /> Start Conversation
              </button>
            </div>
          ) : conversations.map((conv: any) => {
            const [bg, fg] = getAvatarColor(conv.customerName);
            return (
              <div key={conv._id} className={`chat-item ${selectedConvId === conv._id ? 'active' : ''}`} onClick={() => setSelectedConvId(conv._id)}>
                <div className="avatar" style={{ background: bg, color: fg }}>{conv.customerName?.[0]?.toUpperCase() || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{conv.customerName}</span>
                    <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{conv.lastMessageTime ? format(safeDate(conv.lastMessageTime), 'HH:mm') : ''}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                    <span style={{ fontSize: '12px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' }}>{conv.lastMessage || 'No messages'}</span>
                    {conv.unreadCount > 0 && <div className="unread-badge" style={{ flexShrink: 0 }}>{conv.unreadCount}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Conversation View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F4F6F8' }}>
        {!selectedConvId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
            <MessageSquare size={56} style={{ color: '#d1d5db' }} />
            <h3 style={{ margin: 0, color: '#9ca3af', fontWeight: '600', fontSize: '18px' }}>Select a conversation</h3>
            <p style={{ margin: 0, color: '#d1d5db', fontSize: '14px' }}>Choose a chat from the list to start messaging</p>
            <button className="btn-primary" style={{ marginTop: '8px', padding: '10px 20px' }} onClick={() => setNewConvModal(true)}>
              <Plus size={16} /> New Conversation
            </button>
          </div>
        ) : (
          <>
            <div style={{ background: 'white', padding: '14px 20px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 5 }}>
              {selectedConv && (<>
                {(() => { const [bg, fg] = getAvatarColor(selectedConv.customerName); return <div className="avatar" style={{ background: bg, color: fg }}>{selectedConv.customerName?.[0]?.toUpperCase()}</div>; })()}
                <div>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#1a1a2e' }}>{selectedConv.customerName}</div>
                  <div style={{ fontSize: '12px', color: '#1B5E37', fontWeight: '500' }}>{formatIndianPhone(selectedConv.customerPhone)}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }} onClick={() => setTemplateModal(true)}>
                    <FileText size={14} /> Template
                  </button>
                  <a href={`/customers?search=${selectedConv.customerPhone}`}><button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}><User size={14} /> Profile</button></a>
                  <a href="/reservations"><button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}><CalendarDays size={14} /> Reserve</button></a>
                </div>
              </>)}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#efeae2', backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat' }}>
              {msgLoading ? <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '40px' }}>Loading...</div>
              : messages.length === 0 ? <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '60px' }}><Hand size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} /><div>No messages yet. Send the first message!</div></div>
              : messages.map((msg: any) => (
                <div key={msg._id} style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ maxWidth: '68%' }}>
                    <div className={msg.direction === 'outbound' ? 'msg-outbound' : 'msg-inbound'} style={{ padding: '10px 14px' }}>
                      {msg.type === 'text' && <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word' }}>{msg.content?.text}</p>}
                      {msg.type === 'template' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} style={{ color: '#6b7280', flexShrink: 0 }} />
                          <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', fontStyle: 'italic', color: '#6b7280' }}>{msg.content?.text || `[Template: ${msg.content?.templateName}]`}</p>
                        </div>
                      )}
                      {msg.type === 'image' && <div>{msg.content?.mediaUrl ? <img src={msg.content.mediaUrl} alt="Image" style={{ maxWidth: '240px', borderRadius: '8px' }} /> : <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Image size={16} /> Image</p>}</div>}
                      {msg.type === 'document' && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FileText size={24} /><div><div style={{ fontSize: '13px', fontWeight: '600' }}>{msg.content?.filename || 'Document'}</div></div></div>}
                      {!['text', 'image', 'document', 'template'].includes(msg.type) && <p style={{ margin: 0 }}>{msg.content?.text || `[${msg.type}]`}</p>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px', textAlign: msg.direction === 'outbound' ? 'right' : 'left', display: 'flex', gap: '4px', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                      {getMessageTime(msg.timestamp)}
                      {msg.direction === 'outbound' && (
                        <span style={{ 
                          color: msg.status === 'read' ? '#34B7F1' : 
                                 msg.status === 'failed' ? '#ef4444' : '#9ca3af' 
                        }}>
                          {msg.status === 'read' || msg.status === 'delivered' ? <CheckCheck size={14} /> : 
                           msg.status === 'sent' ? <Check size={14} /> : 
                           msg.status === 'failed' ? <AlertCircle size={14} /> : 
                           <Clock size={12} />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {showQuickReplies && (
              <div style={{ background: 'white', borderTop: '1px solid #e5e7eb', padding: '12px 20px', maxHeight: '200px', overflowY: 'auto' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={14} style={{ color: '#1B5E37' }} /> Quick Replies</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {quickReplies?.map((qr: any) => <button key={qr._id} onClick={() => { setMessageText(qr.body); setShowQuickReplies(false); }} style={{ padding: '6px 14px', background: '#E8F5E9', border: '1px solid #A7D5B8', borderRadius: '20px', fontSize: '13px', color: '#1B5E37', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500' }}>{qr.title}</button>)}
                </div>
              </div>
            )}
            <div style={{ background: 'white', borderTop: '1px solid #374151', padding: '12px 16px', zIndex: 5 }}>
              <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <button type="button" onClick={() => setShowQuickReplies(!showQuickReplies)} style={{ padding: '10px', background: showQuickReplies ? '#E8F5E9' : '#f9fafb', border: `1px solid ${showQuickReplies ? '#A7D5B8' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={18} style={{ color: showQuickReplies ? '#1B5E37' : '#6b7280' }} /></button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; toast('File upload requires Cloudinary setup.'); e.target.value = ''; }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Paperclip size={18} style={{ color: '#6b7280' }} /></button>
                <div style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ padding: '10px', background: showEmojiPicker ? '#E8F5E9' : '#f9fafb', border: `1px solid ${showEmojiPicker ? '#A7D5B8' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Smile size={18} style={{ color: showEmojiPicker ? '#1B5E37' : '#6b7280' }} />
                  </button>
                  {showEmojiPicker && (
                    <div style={{ position: 'absolute', bottom: '50px', left: 0, zIndex: 100 }}>
                      <EmojiPicker onEmojiClick={(emojiData) => {
                        setMessageText(prev => prev + emojiData.emoji);
                        setShowEmojiPicker(false);
                      }} />
                    </div>
                  )}
                </div>
                <textarea value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }} placeholder="Type a message..." rows={1} className="input-field" style={{ flex: 1, resize: 'none', maxHeight: '100px', fontFamily: 'Inter, sans-serif', lineHeight: '1.5' }} />
                <button type="submit" disabled={!messageText.trim() || sendText.isPending} className="btn-primary" style={{ padding: '10px 18px', borderRadius: '10px', flexShrink: 0, opacity: (!messageText.trim() || sendText.isPending) ? 0.5 : 1 }}>
                  {sendText.isPending ? <Loader2 size={18} /> : <><Send size={16} /> Send</>}
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {newConvModal && (
        <NewConversationModal
          onClose={() => setNewConvModal(false)}
          onCreated={(convId) => {
            setNewConvModal(false);
            setSelectedConvId(convId);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
          }}
        />
      )}

      {templateModal && selectedConvId && selectedConv && (
        <SendTemplateModal
          conversationId={selectedConvId}
          phone={selectedConv.customerPhone}
          customerName={selectedConv.customerName || ''}
          onClose={() => setTemplateModal(false)}
        />
      )}
    </div>
  );
}
