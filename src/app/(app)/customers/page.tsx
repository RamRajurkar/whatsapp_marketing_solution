'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Users, Search, Plus, Pencil, Trash2, UserPlus,
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
            <input className="input-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value, waId: e.target.value })} placeholder="919876543210 (without +)" />
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

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; customer?: any }>({ open: false });

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
                    <div>No customers yet. Customers appear automatically when they message you on WhatsApp.</div>
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
                      <a href={`/inbox`} style={{ color: '#1B5E37', fontWeight: '500', textDecoration: 'none', fontSize: '13px' }}>
                        +{c.phone}
                      </a>
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
    </div>
  );
}
