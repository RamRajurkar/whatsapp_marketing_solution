'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { getSocket } from '@/lib/socket';
import { format, parseISO } from 'date-fns';
import {
  Calendar, Clock, Users, Phone, CheckCircle, XCircle,
  Clock3, Filter, Check, X, CheckSquare
} from 'lucide-react';

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', statusFilter],
    queryFn: () => api.get(`/api/reservations${statusFilter !== 'All' ? `?status=${statusFilter}` : ''}`).then(res => res.data),
  });

  const reservations = data?.data || [];

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/reservations/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Status updated successfully');
    },
    onError: () => toast.error('Failed to update status'),
  });

  useEffect(() => {
    const socket = getSocket();
    
    socket.on('reservation:new', (newReservation) => {
      // Re-fetch or manually push to cache
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(`New reservation from ${newReservation.guestName}!`, { icon: '🔔' });
    });

    return () => {
      socket.off('reservation:new');
    };
  }, [queryClient]);

  const filteredReservations = reservations.filter((res: any) => {
    if (dateFilter) {
      // res.date is a string like "25 June" or "Tomorrow". It's hard to exactly match native Date filters.
      // We'll just do a simple string includes match for now.
      return res.date.toLowerCase().includes(dateFilter.toLowerCase());
    }
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-title">Reservations</h1>
            <p className="page-subtitle">Manage table bookings and guest requests</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>
        <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', padding: '8px 12px', borderRadius: '8px' }}>
              <Filter size={16} style={{ color: '#6B7280' }} />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: '#374151', cursor: 'pointer' }}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', padding: '8px 12px', borderRadius: '8px' }}>
              <Calendar size={16} style={{ color: '#6B7280' }} />
              <input 
                type="text"
                placeholder="Filter by Date (e.g. 25 June)"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: '#374151' }}
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="skeleton" style={{ height: '40px', marginBottom: '12px' }} />
            <div className="skeleton" style={{ height: '40px', marginBottom: '12px' }} />
            <div className="skeleton" style={{ height: '40px' }} />
          </div>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#FAFBFC', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280' }}>Guest</th>
                    <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280' }}>Party Size</th>
                    <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280' }}>Date & Time</th>
                    <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280' }}>Status</th>
                    <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReservations.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                        No reservations found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredReservations.map((res: any) => (
                      <tr key={res._id} style={{ borderBottom: '1px solid #E5E7EB', transition: 'background 0.2s', ':hover': { background: '#FAFBFC' } } as any}>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ fontWeight: '600', color: '#111827', fontSize: '14px', marginBottom: '4px' }}>{res.guestName}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6B7280', fontSize: '12px' }}>
                            <Phone size={12} /> {res.phone}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#374151', fontSize: '14px' }}>
                            <Users size={16} style={{ color: '#8B5CF6' }} /> {res.guests}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#374151', fontSize: '14px', marginBottom: '4px' }}>
                            <Calendar size={14} style={{ color: '#3B82F6' }} /> {res.date}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B7280', fontSize: '13px' }}>
                            <Clock size={14} /> {res.time}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                            background: res.status === 'Pending' ? '#FEF3C7' : 
                                        res.status === 'Confirmed' ? '#DBEAFE' : 
                                        res.status === 'Completed' ? '#D1FAE5' : '#FEE2E2',
                            color: res.status === 'Pending' ? '#D97706' : 
                                   res.status === 'Confirmed' ? '#2563EB' : 
                                   res.status === 'Completed' ? '#059669' : '#DC2626',
                          }}>
                            {res.status === 'Pending' && <Clock3 size={12} />}
                            {res.status === 'Confirmed' && <CheckCircle size={12} />}
                            {res.status === 'Completed' && <CheckSquare size={12} />}
                            {res.status === 'Cancelled' && <XCircle size={12} />}
                            {res.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            {res.status === 'Pending' && (
                              <>
                                <button 
                                  onClick={() => updateStatusMutation.mutate({ id: res._id, status: 'Confirmed' })}
                                  disabled={updateStatusMutation.isPending}
                                  style={{ padding: '6px 12px', borderRadius: '6px', background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600' }}
                                >
                                  <Check size={14} /> Confirm
                                </button>
                                <button 
                                  onClick={() => updateStatusMutation.mutate({ id: res._id, status: 'Cancelled' })}
                                  disabled={updateStatusMutation.isPending}
                                  style={{ padding: '6px 12px', borderRadius: '6px', background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600' }}
                                >
                                  <X size={14} /> Cancel
                                </button>
                              </>
                            )}
                            {res.status === 'Confirmed' && (
                              <button 
                                onClick={() => updateStatusMutation.mutate({ id: res._id, status: 'Completed' })}
                                disabled={updateStatusMutation.isPending}
                                style={{ padding: '6px 12px', borderRadius: '6px', background: '#059669', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600' }}
                              >
                                <CheckSquare size={14} /> Mark Completed
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
