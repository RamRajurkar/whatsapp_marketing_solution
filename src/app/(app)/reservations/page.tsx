'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_CONFIG = {
  pending: { label: 'Pending', class: 'badge-pending', emoji: '⏳' },
  confirmed: { label: 'Confirmed', class: 'badge-confirmed', emoji: '✅' },
  completed: { label: 'Completed', class: 'badge-completed', emoji: '🎉' },
  cancelled: { label: 'Cancelled', class: 'badge-cancelled', emoji: '❌' },
};

function ReservationModal({ reservation, onClose, onSave }: any) {
  const [form, setForm] = useState(reservation || {
    customerName: '', customerPhone: '', reservationDate: '', reservationTime: '19:00',
    numberOfGuests: 2, specialRequests: '', status: 'pending',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700' }}>
          {reservation ? '✏️ Edit Reservation' : '📅 New Reservation'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Customer Name *</label>
            <input className="input-field" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder="Customer name" />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Phone Number *</label>
            <input className="input-field" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} placeholder="919876543210" />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Number of Guests *</label>
            <input className="input-field" type="number" min="1" max="20" value={form.numberOfGuests} onChange={e => setForm({ ...form, numberOfGuests: parseInt(e.target.value) })} />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Date *</label>
            <input className="input-field" type="date" value={form.reservationDate ? form.reservationDate.split('T')[0] : ''} onChange={e => setForm({ ...form, reservationDate: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Time *</label>
            <input className="input-field" type="time" value={form.reservationTime} onChange={e => setForm({ ...form, reservationTime: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Status</label>
            <select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="pending">⏳ Pending</option>
              <option value="confirmed">✅ Confirmed</option>
              <option value="completed">🎉 Completed</option>
              <option value="cancelled">❌ Cancelled</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Special Requests</label>
            <textarea className="input-field" value={form.specialRequests} onChange={e => setForm({ ...form, specialRequests: e.target.value })} placeholder="Dietary restrictions, seating preferences, occasion..." rows={3} style={{ resize: 'none', fontFamily: 'Inter, sans-serif' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)}>
            {reservation ? 'Save Changes' : 'Create Reservation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; reservation?: any }>({ open: false });
  const [filterStatus, setFilterStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', filterStatus],
    queryFn: () => api.get(`/api/reservations?status=${filterStatus}&limit=100`).then(r => r.data),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/api/reservations', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); setModal({ open: false }); toast.success('Reservation created!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.patch(`/api/reservations/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); setModal({ open: false }); toast.success('Reservation updated!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/reservations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); toast.success('Deleted'); },
  });

  const handleSave = (form: any) => {
    if (modal.reservation) updateMutation.mutate({ id: modal.reservation._id, data: form });
    else createMutation.mutate(form);
  };

  const reservations = data?.reservations || [];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Reservations</h1>
            <p className="page-subtitle">{data?.total || 0} total reservations</p>
          </div>
          <button className="btn-primary" onClick={() => setModal({ open: true })}>
            ➕ New Reservation
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>
        {/* Filters */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: '#64748b' }}>Filter:</span>
          {[
            { value: '', label: 'All' },
            { value: 'pending', label: '⏳ Pending' },
            { value: 'confirmed', label: '✅ Confirmed' },
            { value: 'completed', label: '🎉 Completed' },
            { value: 'cancelled', label: '❌ Cancelled' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              style={{
                padding: '6px 16px', borderRadius: '20px', border: '1.5px solid',
                fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500',
                background: filterStatus === opt.value ? '#0f172a' : 'white',
                color: filterStatus === opt.value ? 'white' : '#374151',
                borderColor: filterStatus === opt.value ? '#0f172a' : '#e2e8f0',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Date & Time</th>
                <th>Guests</th>
                <th>Special Requests</th>
                <th>Status</th>
                <th>Quick Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={7}><div className="skeleton" style={{ height: '14px' }} /></td></tr>
                ))
              ) : reservations.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>📅</div>
                    No reservations found
                  </td>
                </tr>
              ) : (
                reservations.map((r: any) => {
                  const sc = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG];
                  return (
                    <tr key={r._id}>
                      <td>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{r.customerName}</div>
                        <div style={{ fontSize: '12px', color: '#25D366' }}>+{r.customerPhone}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', fontSize: '13px' }}>
                          {r.reservationDate ? format(new Date(r.reservationDate), 'MMM d, yyyy') : '-'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{r.reservationTime}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '16px' }}>👥 {r.numberOfGuests}</td>
                      <td style={{ color: '#64748b', fontSize: '12px', maxWidth: '200px' }}>{r.specialRequests || '-'}</td>
                      <td>
                        <span className={sc?.class} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                          {sc?.emoji} {sc?.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {r.status === 'pending' && (
                            <button onClick={() => updateMutation.mutate({ id: r._id, data: { status: 'confirmed' } })} style={{ padding: '4px 10px', background: '#d1fae5', color: '#059669', border: 'none', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
                              ✅ Confirm
                            </button>
                          )}
                          {(r.status === 'pending' || r.status === 'confirmed') && (
                            <button onClick={() => updateMutation.mutate({ id: r._id, data: { status: 'cancelled' } })} style={{ padding: '4px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
                              ❌ Cancel
                            </button>
                          )}
                          {r.status === 'confirmed' && (
                            <button onClick={() => updateMutation.mutate({ id: r._id, data: { status: 'completed' } })} style={{ padding: '4px 10px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
                              🎉 Complete
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setModal({ open: true, reservation: r })}>✏️ Edit</button>
                          <button className="btn-danger" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(r._id); }}>🗑️</button>
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

      {modal.open && (
        <ReservationModal reservation={modal.reservation} onClose={() => setModal({ open: false })} onSave={handleSave} />
      )}
    </div>
  );
}
