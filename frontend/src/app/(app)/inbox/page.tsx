'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  MessageSquare, Search, User, CalendarDays, Zap, Paperclip,
  Send, Loader2, Image, FileText, Check, CheckCheck,
  Inbox as InboxIcon, Hand,
} from 'lucide-react';

const AVATAR_COLORS = [
  ['#D1FAE5', '#166534'], ['#DBEAFE', '#1E40AF'], ['#FCE7F3', '#9D174D'],
  ['#FEF3C7', '#92400E'], ['#EDE9FE', '#5B21B6'], ['#FEE2E2', '#991B1B'],
];

function getAvatarColor(name: string) {
  const idx = (name?.charCodeAt(0) || 65) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function InboxPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(searchParams.get('id'));
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
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
    onSuccess: () => { setMessageText(''); queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send'),
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
  const getMessageTime = (ts: string) => { try { return format(new Date(ts), 'HH:mm'); } catch { return ''; } };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 68px)', overflow: 'hidden' }}>
      {/* Chat List */}
      <div style={{ width: '340px', borderRight: '1px solid #e5e7eb', background: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: '800', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={20} style={{ color: '#1B5E37' }} /> Inbox
          </h2>
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
            </div>
          ) : conversations.map((conv: any) => {
            const [bg, fg] = getAvatarColor(conv.customerName);
            return (
              <div key={conv._id} className={`chat-item ${selectedConvId === conv._id ? 'active' : ''}`} onClick={() => setSelectedConvId(conv._id)}>
                <div className="avatar" style={{ background: bg, color: fg }}>{conv.customerName?.[0]?.toUpperCase() || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{conv.customerName}</span>
                    <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{conv.lastMessageTime ? format(new Date(conv.lastMessageTime), 'HH:mm') : ''}</span>
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
          </div>
        ) : (
          <>
            <div style={{ background: 'white', padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {selectedConv && (<>
                {(() => { const [bg, fg] = getAvatarColor(selectedConv.customerName); return <div className="avatar" style={{ background: bg, color: fg }}>{selectedConv.customerName?.[0]?.toUpperCase()}</div>; })()}
                <div>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#1a1a2e' }}>{selectedConv.customerName}</div>
                  <div style={{ fontSize: '12px', color: '#1B5E37', fontWeight: '500' }}>+{selectedConv.customerPhone}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  <a href={`/customers?search=${selectedConv.customerPhone}`}><button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}><User size={14} /> Profile</button></a>
                  <a href="/reservations"><button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}><CalendarDays size={14} /> Reserve</button></a>
                </div>
              </>)}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {msgLoading ? <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '40px' }}>Loading...</div>
              : messages.length === 0 ? <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '60px' }}><Hand size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} /><div>No messages yet. Send the first message!</div></div>
              : messages.map((msg: any) => (
                <div key={msg._id} style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ maxWidth: '68%' }}>
                    <div className={msg.direction === 'outbound' ? 'msg-outbound' : 'msg-inbound'} style={{ padding: '10px 14px' }}>
                      {msg.type === 'text' && <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word' }}>{msg.content?.text}</p>}
                      {msg.type === 'image' && <div>{msg.content?.mediaUrl ? <img src={msg.content.mediaUrl} alt="Image" style={{ maxWidth: '240px', borderRadius: '8px' }} /> : <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Image size={16} /> Image</p>}</div>}
                      {msg.type === 'document' && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FileText size={24} /><div><div style={{ fontSize: '13px', fontWeight: '600' }}>{msg.content?.filename || 'Document'}</div></div></div>}
                      {!['text', 'image', 'document'].includes(msg.type) && <p style={{ margin: 0 }}>{msg.content?.text || `[${msg.type}]`}</p>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px', textAlign: msg.direction === 'outbound' ? 'right' : 'left', display: 'flex', gap: '4px', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                      {getMessageTime(msg.timestamp)}
                      {msg.direction === 'outbound' && <span style={{ color: msg.status === 'read' ? '#1B5E37' : '#9ca3af' }}>{msg.status === 'read' || msg.status === 'delivered' ? <CheckCheck size={14} /> : <Check size={14} />}</span>}
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
            <div style={{ background: 'white', borderTop: '1px solid #e5e7eb', padding: '12px 16px' }}>
              <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <button type="button" onClick={() => setShowQuickReplies(!showQuickReplies)} style={{ padding: '10px', background: showQuickReplies ? '#E8F5E9' : '#f9fafb', border: `1px solid ${showQuickReplies ? '#A7D5B8' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={18} style={{ color: showQuickReplies ? '#1B5E37' : '#6b7280' }} /></button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; toast('File upload requires Cloudinary setup.'); e.target.value = ''; }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Paperclip size={18} style={{ color: '#6b7280' }} /></button>
                <textarea value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }} placeholder="Type a message..." rows={1} className="input-field" style={{ flex: 1, resize: 'none', maxHeight: '100px', fontFamily: 'Inter, sans-serif', lineHeight: '1.5' }} />
                <button type="submit" disabled={!messageText.trim() || sendText.isPending} className="btn-primary" style={{ padding: '10px 18px', borderRadius: '10px', flexShrink: 0, opacity: (!messageText.trim() || sendText.isPending) ? 0.5 : 1 }}>
                  {sendText.isPending ? <Loader2 size={18} /> : <><Send size={16} /> Send</>}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
