'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const AVATAR_COLORS = [
  ['#dcfce7', '#166534'], ['#dbeafe', '#1e40af'], ['#fce7f3', '#9d174d'],
  ['#fef3c7', '#92400e'], ['#ede9fe', '#5b21b6'], ['#fee2e2', '#991b1b'],
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
    enabled: !!selectedConvId,
    refetchInterval: false,
  });

  const { data: quickReplies } = useQuery({
    queryKey: ['quickReplies'],
    queryFn: () => api.get('/api/quick-replies').then(r => r.data),
  });

  const sendText = useMutation({
    mutationFn: (text: string) => api.post(`/api/conversations/${selectedConvId}/send-text`, { text }),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send'),
  });

  // Socket.io real-time
  useEffect(() => {
    const socket = getSocket();
    socket.on('message:new', (msg: any) => {
      queryClient.invalidateQueries({ queryKey: ['messages', msg.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('conversation:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    return () => {
      socket.off('message:new');
      socket.off('conversation:updated');
    };
  }, [queryClient]);

  useEffect(() => {
    if (selectedConvId) {
      const socket = getSocket();
      socket.emit('join:conversation', selectedConvId);
    }
  }, [selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  const selectedConv = convData?.conversations?.find((c: any) => c._id === selectedConvId);
  const messages = messagesData?.messages || [];
  const conversations = convData?.conversations || [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConvId) return;
    sendText.mutate(messageText.trim());
  };

  const insertQuickReply = (body: string) => {
    setMessageText(body);
    setShowQuickReplies(false);
  };

  const getMessageTime = (ts: string) => {
    try { return format(new Date(ts), 'HH:mm'); } catch { return ''; }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Chat List */}
      <div style={{
        width: '340px', borderRight: '1px solid #e2e8f0', background: 'white',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
            💬 Inbox
          </h2>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '16px' }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="input-field"
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convLoading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="skeleton" style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ height: '12px', width: '80%' }} />
                </div>
              </div>
            ))
          ) : conversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8', fontSize: '14px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
              No conversations yet.<br />Messages will appear here when customers contact you.
            </div>
          ) : (
            conversations.map((conv: any) => {
              const [bg, fg] = getAvatarColor(conv.customerName);
              return (
                <div
                  key={conv._id}
                  className={`chat-item ${selectedConvId === conv._id ? 'active' : ''}`}
                  onClick={() => setSelectedConvId(conv._id)}
                >
                  <div className="avatar" style={{ background: bg, color: fg }}>
                    {conv.customerName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                        {conv.customerName}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                        {conv.lastMessageTime ? format(new Date(conv.lastMessageTime), 'HH:mm') : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' }}>
                        {conv.lastMessage || 'No messages'}
                      </span>
                      {conv.unreadCount > 0 && (
                        <div className="unread-badge" style={{ flexShrink: 0 }}>{conv.unreadCount}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Conversation View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f4f8', position: 'relative' }}>
        {!selectedConvId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '80px' }}>💬</div>
            <h3 style={{ margin: 0, color: '#94a3b8', fontWeight: '600', fontSize: '18px' }}>Select a conversation</h3>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '14px' }}>Choose a chat from the list to start messaging</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{
              background: 'white', padding: '14px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', gap: '12px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              {selectedConv && (
                <>
                  {(() => {
                    const [bg, fg] = getAvatarColor(selectedConv.customerName);
                    return (
                      <div className="avatar" style={{ background: bg, color: fg }}>
                        {selectedConv.customerName?.[0]?.toUpperCase()}
                      </div>
                    );
                  })()}
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{selectedConv.customerName}</div>
                    <div style={{ fontSize: '12px', color: '#25D366', fontWeight: '500' }}>
                      +{selectedConv.customerPhone}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <a href={`/customers?search=${selectedConv.customerPhone}`}>
                      <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
                        👤 Profile
                      </button>
                    </a>
                    <a href={`/reservations`}>
                      <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
                        📅 Reserve
                      </button>
                    </a>
                  </div>
                </>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {msgLoading ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: '40px' }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: '60px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>👋</div>
                  No messages yet. Send the first message!
                </div>
              ) : (
                messages.map((msg: any) => (
                  <div key={msg._id} style={{
                    display: 'flex',
                    justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    <div style={{ maxWidth: '68%' }}>
                      <div className={msg.direction === 'outbound' ? 'msg-outbound' : 'msg-inbound'} style={{ padding: '10px 14px' }}>
                        {msg.type === 'text' && (
                          <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word' }}>
                            {msg.content?.text}
                          </p>
                        )}
                        {msg.type === 'image' && (
                          <div>
                            {msg.content?.mediaUrl ? (
                              <img src={msg.content.mediaUrl} alt="Image" style={{ maxWidth: '240px', borderRadius: '8px' }} />
                            ) : (
                              <p style={{ margin: 0, fontSize: '14px' }}>📷 Image</p>
                            )}
                            {msg.content?.caption && <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>{msg.content.caption}</p>}
                          </div>
                        )}
                        {msg.type === 'document' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '28px' }}>📄</span>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '600' }}>{msg.content?.filename || 'Document'}</div>
                              <div style={{ fontSize: '11px', opacity: 0.7 }}>PDF Document</div>
                            </div>
                          </div>
                        )}
                        {!['text', 'image', 'document'].includes(msg.type) && (
                          <p style={{ margin: 0, fontSize: '14px' }}>
                            {msg.content?.text || `[${msg.type}]`}
                          </p>
                        )}
                      </div>
                      <div style={{
                        fontSize: '11px', color: '#94a3b8', marginTop: '3px',
                        textAlign: msg.direction === 'outbound' ? 'right' : 'left',
                        display: 'flex', gap: '4px', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                        alignItems: 'center',
                      }}>
                        {getMessageTime(msg.timestamp)}
                        {msg.direction === 'outbound' && (
                          <span style={{ color: msg.status === 'read' ? '#25D366' : '#94a3b8' }}>
                            {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies Panel */}
            {showQuickReplies && (
              <div style={{
                background: 'white', borderTop: '1px solid #e2e8f0',
                padding: '12px 20px', maxHeight: '200px', overflowY: 'auto',
              }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>⚡ Quick Replies</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {quickReplies?.map((qr: any) => (
                    <button
                      key={qr._id}
                      onClick={() => insertQuickReply(qr.body)}
                      style={{
                        padding: '6px 14px', background: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: '20px',
                        fontSize: '13px', color: '#15803d', cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif', fontWeight: '500',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
                      onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}
                    >
                      {qr.title}
                    </button>
                  ))}
                  {(!quickReplies || quickReplies.length === 0) && (
                    <span style={{ color: '#94a3b8', fontSize: '13px' }}>No quick replies yet. Create some in Quick Replies section.</span>
                  )}
                </div>
              </div>
            )}

            {/* Message Composer */}
            <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '12px 16px' }}>
              <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  title="Quick Replies"
                  style={{
                    padding: '10px', background: showQuickReplies ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${showQuickReplies ? '#bbf7d0' : '#e2e8f0'}`,
                    borderRadius: '10px', cursor: 'pointer', fontSize: '18px',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}
                >⚡</button>

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    toast('File upload requires Cloudinary setup. Configure in Settings.', { icon: 'ℹ️' });
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach File"
                  style={{
                    padding: '10px', background: '#f8fafc',
                    border: '1px solid #e2e8f0', borderRadius: '10px',
                    cursor: 'pointer', fontSize: '18px', flexShrink: 0,
                  }}
                >📎</button>

                <textarea
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                  placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  className="input-field"
                  style={{ flex: 1, resize: 'none', maxHeight: '100px', fontFamily: 'Inter, sans-serif', lineHeight: '1.5' }}
                />

                <button
                  type="submit"
                  disabled={!messageText.trim() || sendText.isPending}
                  className="btn-primary"
                  style={{
                    padding: '10px 18px', borderRadius: '10px', flexShrink: 0,
                    opacity: (!messageText.trim() || sendText.isPending) ? 0.5 : 1,
                  }}
                >
                  {sendText.isPending ? '⏳' : '📤 Send'}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
