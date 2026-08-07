'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { getSocket } from '@/lib/socket';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import {
  Package, Tag, Layers, Phone, CheckCircle2, Clock, XCircle,
  Filter, Search, MessageSquare, CheckSquare, Sparkles, User, Briefcase
} from 'lucide-react';

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  Pending: { bg: '#fffbeb', text: '#b45309', border: '#fde68a', label: '🟡 Pending' },
  Contacted: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', label: '🔵 Contacted' },
  Confirmed: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', label: '🟢 Confirmed' },
  Completed: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', label: '🟢 Completed' },
  Cancelled: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: '🔴 Cancelled' },
};

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', statusFilter],
    queryFn: () => api.get(`/api/reservations/${statusFilter !== 'All' ? `?status=${statusFilter}` : ''}`).then(res => res.data),
    refetchInterval: 5000,
  });

  const leads = data?.data || [];

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/reservations/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Lead status updated');
    },
    onError: () => toast.error('Failed to update lead status'),
  });

  useEffect(() => {
    const socket = getSocket();
    socket.on('reservation:new', (newLead) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(`🎉 New Product Enquiry received from ${newLead.customerName || newLead.phone}!`, { duration: 6000 });
    });

    return () => {
      socket.off('reservation:new');
    };
  }, [queryClient]);

  const filteredLeads = leads.filter((lead: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (lead.customerName || '').toLowerCase().includes(q) ||
      (lead.customerPhone || '').toLowerCase().includes(q) ||
      (lead.productName || '').toLowerCase().includes(q) ||
      (lead.styleCode || '').toLowerCase().includes(q) ||
      (lead.requirements || '').toLowerCase().includes(q)
    );
  });

  const pendingCount = leads.filter((l: any) => l.status === 'Pending').length;
  const contactedCount = leads.filter((l: any) => l.status === 'Contacted').length;
  const completedCount = leads.filter((l: any) => l.status === 'Completed').length;

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Briefcase size={24} style={{ color: '#1B5E37' }} /> Leads & Wholesale Enquiries
            </h1>
            <p className="page-subtitle">Track, manage, and convert captured product inquiries from WhatsApp in real time</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>
        
        {/* Analytics Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '14px', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Total Captured Leads</div>
            <div style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>{leads.length}</div>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '14px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>🟡 Pending Inquiries</div>
            <div style={{ fontSize: '26px', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>{pendingCount}</div>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '14px', borderLeft: '4px solid #2563eb' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>🔵 Contacted / In Progress</div>
            <div style={{ fontSize: '26px', fontWeight: '800', color: '#2563eb', marginTop: '4px' }}>{contactedCount}</div>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '14px', borderLeft: '4px solid #16a34a' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>🟢 Converted / Completed</div>
            <div style={{ fontSize: '26px', fontWeight: '800', color: '#16a34a', marginTop: '4px' }}>{completedCount}</div>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            
            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {['All', 'Pending', 'Contacted', 'Completed', 'Cancelled'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '7px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer',
                    background: statusFilter === st ? '#1B5E37' : '#f1f5f9',
                    color: statusFilter === st ? 'white' : '#475569',
                    transition: 'all 0.2s',
                  }}
                >
                  {st === 'All' ? 'All Leads' : st}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '280px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                className="input-field"
                placeholder="Search product, style code, phone, or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '38px', fontSize: '13px' }}
              />
            </div>
          </div>
        </div>

        {/* Leads Table */}
        {isLoading ? (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="skeleton" style={{ height: '40px', marginBottom: '12px' }} />
            <div className="skeleton" style={{ height: '40px', marginBottom: '12px' }} />
            <div className="skeleton" style={{ height: '40px' }} />
          </div>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden', borderRadius: '16px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '14px 18px', fontWeight: '600', color: '#475569' }}>Customer Contact</th>
                    <th style={{ padding: '14px 18px', fontWeight: '600', color: '#475569' }}>Product & Style Code</th>
                    <th style={{ padding: '14px 18px', fontWeight: '600', color: '#475569' }}>Requested Qty</th>
                    <th style={{ padding: '14px 18px', fontWeight: '600', color: '#475569' }}>Requirements / Notes</th>
                    <th style={{ padding: '14px 18px', fontWeight: '600', color: '#475569' }}>Timestamp</th>
                    <th style={{ padding: '14px 18px', fontWeight: '600', color: '#475569', textAlign: 'right' }}>Status & Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                        <Package size={32} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                        <div style={{ fontWeight: '600', color: '#475569', fontSize: '15px' }}>No product inquiries found matching criteria</div>
                        <div style={{ fontSize: '12px', marginTop: '4px' }}>Captured wholesale inquiries from WhatsApp chatbot will appear here in real time.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead: any) => {
                      const stConfig = STATUS_COLORS[lead.status] || STATUS_COLORS.Pending;
                      let formattedDate = '—';
                      try {
                        if (lead.createdAt) {
                          formattedDate = format(parseISO(lead.createdAt), 'MMM d, yyyy • HH:mm');
                        }
                      } catch {
                        formattedDate = lead.createdAt || '—';
                      }

                      return (
                        <tr key={lead._id} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}>
                          
                          {/* Column 1: Customer */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>
                                {lead.customerName || 'Unknown Customer'}
                              </span>
                              {(lead.isRepeatLead || (lead.inquiryCount && lead.inquiryCount > 1)) && (
                                <span style={{
                                  fontSize: '10px', fontWeight: '700', color: '#7c3aed', background: '#f3e8ff', border: '1px solid #ddd6fe',
                                  padding: '1px 6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px'
                                }}>
                                  <Sparkles size={10} /> Repeat Lead ({lead.inquiryCount} Inquiries)
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>
                              <Phone size={12} /> {lead.customerPhone || lead.phone}
                            </div>
                            <Link
                              href={`/inbox?phone=${lead.customerPhone || lead.phone}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600',
                                color: '#1B5E37', background: '#ecfdf5', padding: '3px 8px', borderRadius: '6px', textDecoration: 'none', border: '1px solid #a7f3d0'
                              }}
                            >
                              <MessageSquare size={11} /> Chat in Inbox
                            </Link>
                          </td>

                          {/* Column 2: Product Name & Code */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Package size={14} style={{ color: '#2563eb' }} />
                              {lead.productName || 'Product Inquiry'}
                            </div>
                            <div style={{ marginTop: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '600', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Tag size={10} /> Code: {lead.styleCode || 'N/A'}
                              </span>
                            </div>
                          </td>

                          {/* Column 3: Quantity Range */}
                          <td style={{ padding: '14px 18px' }}>
                            <span style={{ background: '#f0fdf4', color: '#166534', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Layers size={13} /> {lead.quantityRange || lead.guests || 'N/A'}
                            </span>
                          </td>

                          {/* Column 4: Customer Requirements */}
                          <td style={{ padding: '14px 18px', maxWidth: '240px' }}>
                            <div style={{ fontSize: '12px', color: '#334155', lineHeight: '1.4', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              {lead.requirements || 'No specific notes'}
                            </div>
                          </td>

                          {/* Column 5: Timestamp */}
                          <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={13} style={{ color: '#94a3b8' }} /> {formattedDate}
                            </div>
                          </td>

                          {/* Column 6: Status Selector */}
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                              <select
                                value={lead.status || 'Pending'}
                                onChange={(e) => updateStatusMutation.mutate({ id: lead._id, status: e.target.value })}
                                disabled={updateStatusMutation.isPending}
                                style={{
                                  padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                                  background: stConfig.bg, color: stConfig.text, border: `1px solid ${stConfig.border}`, outline: 'none',
                                }}
                              >
                                <option value="Pending">🟡 Pending</option>
                                <option value="Contacted">🔵 Contacted</option>
                                <option value="Confirmed">🟢 Confirmed</option>
                                <option value="Completed">🟢 Completed</option>
                                <option value="Cancelled">🔴 Cancelled</option>
                              </select>
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
        )}
      </div>
    </div>
  );
}
