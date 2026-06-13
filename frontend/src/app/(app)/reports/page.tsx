'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { Users, MessageSquare, CalendarDays, Megaphone } from 'lucide-react';

export default function ReportsPage() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useQuery({ queryKey: ['analytics', days], queryFn: () => api.get(`/api/reports/analytics?days=${days}`).then(r => r.data) });
  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/api/reports/dashboard').then(r => r.data) });
  const messageChart = data?.dailyMessages?.map((d: any) => ({ date: format(new Date(d._id), 'MMM d'), Received: d.inbound, Sent: d.outbound })) || [];
  const customerChart = data?.dailyCustomers?.map((d: any) => ({ date: format(new Date(d._id), 'MMM d'), 'New Customers': d.count })) || [];
  const reservationChart = data?.dailyReservations?.map((d: any) => ({ date: format(new Date(d._id), 'MMM d'), Reservations: d.count })) || [];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div><h1 className="page-title">Reports & Analytics</h1><p className="page-subtitle">Track your restaurant&apos;s WhatsApp performance</p></div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: '600', background: days === d ? '#1B5E37' : 'white', color: days === d ? 'white' : '#374151', borderColor: days === d ? '#1B5E37' : '#e5e7eb' }}>{d}d</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '0 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {[
            { icon: Users, label: 'Total Customers', value: dashboard?.totalCustomers || 0, color: '#1B5E37', bg: '#E8F5E9' },
            { icon: MessageSquare, label: 'Total Messages', value: data?.totals?.messages || 0, color: '#1D4ED8', bg: '#DBEAFE' },
            { icon: CalendarDays, label: 'Total Reservations', value: data?.totals?.reservations || 0, color: '#B45309', bg: '#FEF3C7' },
            { icon: Megaphone, label: 'Broadcasts Sent', value: data?.totals?.broadcasts?.sent || 0, color: '#6D28D9', bg: '#EDE9FE' },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ color: '#6b7280', fontSize: '12px', fontWeight: '500', margin: '0 0 6px' }}>{stat.label}</p>
                    <h3 style={{ fontSize: '28px', fontWeight: '800', margin: 0, color: '#1a1a2e' }}>{stat.value.toLocaleString()}</h3>
                  </div>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} style={{ color: stat.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}><MessageSquare size={16} style={{ color: '#1B5E37' }} /> Messages (Last {days} Days)</h3>
            {isLoading ? <div className="skeleton" style={{ height: '200px' }} /> : messageChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={messageChart}><defs><linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1B5E37" stopOpacity={0.3} /><stop offset="95%" stopColor="#1B5E37" stopOpacity={0} /></linearGradient><linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} /><YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} /><Tooltip contentStyle={{ borderRadius: '10px', fontSize: '12px' }} /><Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="Received" stroke="#1B5E37" fill="url(#gR)" strokeWidth={2} /><Area type="monotone" dataKey="Sent" stroke="#3B82F6" fill="url(#gS)" strokeWidth={2} /></AreaChart>
              </ResponsiveContainer>
            ) : <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>No data yet</div>}
          </div>
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16} style={{ color: '#1B5E37' }} /> New Customers (Last {days} Days)</h3>
            {isLoading ? <div className="skeleton" style={{ height: '200px' }} /> : customerChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}><BarChart data={customerChart}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} /><YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} /><Tooltip contentStyle={{ borderRadius: '10px', fontSize: '12px' }} /><Bar dataKey="New Customers" fill="#1B5E37" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            ) : <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>No data yet</div>}
          </div>
          <div className="glass-card" style={{ padding: '24px', gridColumn: '1 / -1' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}><CalendarDays size={16} style={{ color: '#1B5E37' }} /> Reservations (Last {days} Days)</h3>
            {isLoading ? <div className="skeleton" style={{ height: '180px' }} /> : reservationChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}><BarChart data={reservationChart}><CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" /><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} /><YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} /><Tooltip contentStyle={{ borderRadius: '10px', fontSize: '12px' }} /><Bar dataKey="Reservations" fill="#B45309" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            ) : <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>No data yet</div>}
          </div>
        </div>
        {data?.totals?.broadcasts && (
          <div className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: '700', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}><Megaphone size={16} style={{ color: '#1B5E37' }} /> Broadcast Statistics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[{ label: 'Total Sent', value: data.totals.broadcasts.total || 0, color: '#6b7280' }, { label: 'Delivered', value: data.totals.broadcasts.sent || 0, color: '#1B5E37' }, { label: 'Failed', value: data.totals.broadcasts.failed || 0, color: '#EF4444' }].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '20px', background: '#FAFBFC', borderRadius: '12px' }}><div style={{ fontSize: '28px', fontWeight: '800', color: s.color }}>{s.value}</div><div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>{s.label}</div></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
