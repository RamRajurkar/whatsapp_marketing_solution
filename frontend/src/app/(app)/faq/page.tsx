'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  HelpCircle, Plus, Trash2, Edit2, Save, X, MessageSquare, ToggleLeft, ToggleRight
} from 'lucide-react';

export default function FAQPage() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ keywords: '', answer: '', isActive: true });
  const [isCreating, setIsCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['faq_items'],
    queryFn: () => api.get('/api/faq').then((res) => res.data.data),
  });

  const faqs = data || [];

  const createMutation = useMutation({
    mutationFn: (newFaq: any) => api.post('/api/faq', newFaq),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faq_items'] });
      toast.success('FAQ created successfully');
      setIsCreating(false);
      setEditForm({ keywords: '', answer: '', isActive: true });
    },
    onError: () => toast.error('Failed to create FAQ'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => api.put(`/api/faq/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faq_items'] });
      toast.success('FAQ updated successfully');
      setIsEditing(null);
    },
    onError: () => toast.error('Failed to update FAQ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/faq/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faq_items'] });
      toast.success('FAQ deleted');
    },
    onError: () => toast.error('Failed to delete FAQ'),
  });

  const handleSave = (id?: string) => {
    const keywordsArray = editForm.keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (keywordsArray.length === 0 || !editForm.answer.trim()) {
      toast.error('Keywords and answer are required');
      return;
    }

    if (id) {
      updateMutation.mutate({ id, updates: { keywords: keywordsArray, answer: editForm.answer, isActive: editForm.isActive } });
    } else {
      createMutation.mutate({ keywords: keywordsArray, answer: editForm.answer, isActive: editForm.isActive });
    }
  };

  const handleEditClick = (faq: any) => {
    setIsEditing(faq._id);
    setEditForm({
      keywords: faq.keywords.join(', '),
      answer: faq.answer,
      isActive: faq.isActive ?? true,
    });
  };

  const toggleActive = (faq: any) => {
    updateMutation.mutate({ id: faq._id, updates: { isActive: !faq.isActive } });
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-title">Smart FAQ Handler</h1>
            <p className="page-subtitle">Train your bot to automatically answer common questions</p>
          </div>
          <button
            onClick={() => { setIsCreating(true); setIsEditing(null); setEditForm({ keywords: '', answer: '', isActive: true }); }}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Add FAQ
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px', maxWidth: '800px' }}>
        {isCreating && (
          <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', border: '2px solid #1B5E37' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>New FAQ</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                Trigger Keywords (comma separated)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. parking, park, car"
                value={editForm.keywords}
                onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                Bot Answer
              </label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="Free parking available behind the restaurant 🅿️"
                value={editForm.answer}
                onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsCreating(false)}
                className="btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave()}
                className="btn-primary"
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                disabled={createMutation.isPending}
              >
                <Save size={16} /> Save FAQ
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card" style={{ padding: '24px' }}>
             <div className="skeleton" style={{ height: '80px', marginBottom: '12px', borderRadius: '12px' }} />
             <div className="skeleton" style={{ height: '80px', borderRadius: '12px' }} />
          </div>
        ) : faqs.length === 0 && !isCreating ? (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
            <HelpCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h3 style={{ margin: '0 0 8px', color: '#374151', fontSize: '16px' }}>No FAQs yet</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>Add keywords and answers to train your bot.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {faqs.map((faq: any) => (
              <div key={faq._id} className="glass-card" style={{ padding: '20px', opacity: faq.isActive ? 1 : 0.6 }}>
                {isEditing === faq._id ? (
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <input
                        type="text"
                        className="input-field"
                        value={editForm.keywords}
                        onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <textarea
                        className="input-field"
                        rows={3}
                        value={editForm.answer}
                        onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                        style={{ resize: 'vertical' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setIsEditing(null)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                        Cancel
                      </button>
                      <button onClick={() => handleSave(faq._id)} className="btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                        Update
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        {faq.keywords.map((k: str, i: number) => (
                          <span key={i} style={{ background: '#F3F4F6', color: '#4B5563', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>
                            {k}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', color: '#1F2937', fontSize: '14px', lineHeight: '1.5', background: '#FAFBFC', padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                        <MessageSquare size={16} style={{ color: '#1B5E37', marginTop: '2px', flexShrink: 0 }} />
                        {faq.answer}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button 
                        onClick={() => toggleActive(faq)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: faq.isActive ? '#1B5E37' : '#9CA3AF' }}
                        title={faq.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {faq.isActive ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                      </button>
                      <button 
                        onClick={() => handleEditClick(faq)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '4px' }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          if (window.confirm('Delete this FAQ?')) deleteMutation.mutate(faq._id);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
