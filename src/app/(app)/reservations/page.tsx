'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { CalendarDays, Plus, Clock, CheckCircle2, PartyPopper, XCircle, Pencil, Trash2, Users } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'Pending', class: 'badge-pending', icon: Clock },
  confirmed: { label: 'Confirmed', class: 'badge-confirmed', icon: CheckCircle2 },
  completed: { label: 'Completed', class: 'badge-completed', icon: PartyPopper },
  cancelled: { label: 'Cancelled', class: 'badge-cancelled', icon: XCircle },
};

function ReservationModal({ reservation, onClose, onSave }: any) {
  const [form, setForm] = useState(reservation || { customerName: '', customerPhone: '', reservationDate: '', reservationTime: '19:00', numberOfGuests: 2, specialRequests: '', status: 'pending' });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {reservation ? <Pencil size={18} style={{ color: '#1B5E37' }} /> : <CalendarDays size={18} style={{ color: '#1B5E37' }} />}
          {reservation ? 'Edit Reservation' : 'New Reservation'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Customer Name *</label><input className="input-field" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder="Customer name" /></div>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Phone Number *</label><input className="input-field" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} placeholder="919876543210" /></div>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Number of Guests *</label><input className="input-field" type="number" min="1" max="20" value={form.numberOfGuests} onChange={e => setForm({ ...form, numberOfGuests: parseInt(e.target.value) })} /></div>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Date *</label><input className="input-field" type="date" value={form.reservationDate ? form.reservationDate.split('T')[0] : ''} onChange={e => setForm({ ...form, reservationDate: e.target.value })} /></div>
          <div><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Time *</label><input className="input-field" type="time" value={form.reservationTime} onChange={e => setForm({ ...form, reservationTime: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Status</label>
            <select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Special Requests</label><textarea className="input-field" value={form.specialRequests} onChange={e => setForm({ ...form, specialRequests: e.target.value })} placeholder="Dietary restrictions, occasion..." rows={3} style={{ resize: 'none', fontFamily: 'Inter, sans-serif' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(form)}>{reservation ? 'Save Changes' : 'Create Reservation'}</button></div>
      </div>
    </div>
  );
}

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; reservation?: any }>({ open: false });
  const [filterStatus, setFilterStatus] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['reservations', filterStatus], queryFn: () => api.get(`/api/reservations?status=${filterStatus}&limit=100`).then(r => r.data), refetchInterval: 30000 });
  const createMutation = useMutation({ mutationFn: (d: any) => api.post('/api/reservations', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); setModal({ open: false }); toast.success('Created!'); }, onError: (e: any) => toast.error(e.response?.data?.error || 'Error') });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: any) => api.patch(`/api/reservations/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); setModal({ open: false }); toast.success('Updated!'); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/api/reservations/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); toast.success('Deleted'); } });
  const handleSave = (form: any) => { if (modal.reservation) updateMutation.mutate({ id: modal.reservation._id, data: form }); else createMutation.mutate(form); };
  const reservations = data?.reservations || [];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div><h1 className="page-title">Reservations</h1><p className="page-subtitle">{data?.total || 0} total reservations</p></div>
          <button className="btn-primary" onClick={() => setModal({ open: true })}><Plus size={16} /> New Reservation</button>
        </div>
      </div>
      <div style={{ padding: '0 32px' }}>
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', marginBottom: '20px', border: '1px solid #e5e7eb', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>Filter:</span>
          {[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }].map(opt => (
            <button key={opt.value} onClick={() => setFilterStatus(opt.value)} style={{ padding: '6px 16px', borderRadius: '20px', border: '1.5px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '500', background: filterStatus === opt.value ? '#1B5E37' : 'white', color: filterStatus === opt.value ? 'white' : '#374151', borderColor: filterStatus === opt.value ? '#1B5E37' : '#e5e7eb', transition: 'all 0.15s' }}>{opt.label}</button>
          ))}
        </div>
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Customer</th><th>Date & Time</th><th>Guests</th><th>Special Requests</th><th>Status</th><th>Quick Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {isLoading ? Array(5).fill(0).map((_, i) => <tr key={i}><td colSpan={7}><div className="skeleton" style={{ height: '14px' }} /></td></tr>)
              : reservations.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}><CalendarDays size={36} style={{ color: '#d1d5db', marginBottom: '8px' }} /><div>No reservations found</div></td></tr>
              : reservations.map((r: any) => {
                const sc = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG];
                const StatusIcon = sc?.icon || Clock;
                return (
                  <tr key={r._id}>
                    <td><div style={{ fontWeight: '600', fontSize: '14px' }}>{r.customerName}</div><div style={{ fontSize: '12px', color: '#1B5E37' }}>+{r.customerPhone}</div></td>
                    <td><div style={{ fontWeight: '600', fontSize: '13px' }}>{r.reservationDate ? format(new Date(r.reservationDate), 'MMM d, yyyy') : '-'}</div><div style={{ fontSize: '12px', color: '#6b7280' }}>{r.reservationTime}</div></td>
                    <td style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={14} style={{ color: '#6b7280' }} /> {r.numberOfGuests}</td>
                    <td style={{ color: '#6b7280', fontSize: '12px', maxWidth: '200px' }}>{r.specialRequests || '-'}</td>
                    <td><span className={sc?.class} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><StatusIcon size={12} /> {sc?.label}</span></td>
                    <td><div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {r.status === 'pending' && <button onClick={() => updateMutation.mutate({ id: r._id, data: { status: 'confirmed' } })} style={{ padding: '4px 10px', background: '#D1FAE5', color: '#047857', border: 'none', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> Confirm</button>}
                      {(r.status === 'pending' || r.status === 'confirmed') && <button onClick={() => updateMutation.mutate({ id: r._id, data: { status: 'cancelled' } })} style={{ padding: '4px 10px', background: '#FEE2E2', color: '#B91C1C', border: 'none', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><XCircle size={11} /> Cancel</button>}
                      {r.status === 'confirmed' && <button onClick={() => updateMutation.mutate({ id: r._id, data: { status: 'completed' } })} style={{ padding: '4px 10px', background: '#DBEAFE', color: '#1D4ED8', border: 'none', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><PartyPopper size={11} /> Complete</button>}
                    </div></td>
                    <td><div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setModal({ open: true, reservation: r })}><Pencil size={12} /> Edit</button>
                      <button className="btn-danger" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(r._id); }}><Trash2 size={12} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {modal.open && <ReservationModal reservation={modal.reservation} onClose={() => setModal({ open: false })} onSave={handleSave} />}
    </div>
  );
}
