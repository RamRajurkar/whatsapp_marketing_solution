'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, getDay } from 'date-fns';
import {
  Megaphone, FileText, Clock, Send, CheckCircle2, XCircle,
  AlertTriangle, Trash2, Plus, Edit2, Loader2, Calendar, ChevronLeft, ChevronRight, X, Image as ImageIcon, Upload,
  Pause, Play, RefreshCw, Download, Search, Filter, CheckCheck, AlertCircle, Eye, Check,
  DollarSign, Zap, Repeat, ArrowRight, ArrowLeft, Users, Smartphone, ExternalLink, PhoneCall,
  CalendarDays, List, Grid
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const getErrorMessage = (err: any, fallback = 'Operation failed') => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail[0]?.msg || detail[0]?.message || JSON.stringify(detail[0]);
  }
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.message) return err.message;
  return fallback;
};

const STATUS_MAP = {
  draft: { label: 'Draft', class: 'badge-draft', icon: FileText, color: '#6b7280' },
  scheduled: { label: 'Scheduled', class: 'badge-scheduled', icon: Clock, color: '#f59e0b' },
  sending: { label: 'Sending', class: 'badge-active', icon: Loader2, color: '#3b82f6' },
  sent: { label: 'Sent', class: 'badge-sent', icon: CheckCircle2, color: '#22c55e' },
  failed: { label: 'Failed', class: 'badge-cancelled', icon: XCircle, color: '#ef4444' },
  partial: { label: 'Partial', class: 'badge-scheduled', icon: AlertTriangle, color: '#f59e0b' },
  paused: { label: 'Paused', class: 'badge-scheduled', icon: Pause, color: '#f59e0b' },
  frequency_capped: { label: 'Freq Capped', class: 'badge-scheduled', icon: AlertTriangle, color: '#f97316' },
};

const GOOGLE_CHIP_STYLES: Record<string, { bg: string; text: string; bar: string; label: string }> = {
  sending: { bg: '#e8f0fe', text: '#1a73e8', bar: '#1a73e8', label: 'Active' },
  scheduled: { bg: '#fef7e0', text: '#b06000', bar: '#f29900', label: 'Scheduled' },
  sent: { bg: '#e6f4ea', text: '#137333', bar: '#1e8e3e', label: 'Completed' },
  failed: { bg: '#fce8e6', text: '#c5221f', bar: '#d93025', label: 'Failed' },
  partial: { bg: '#fef7e0', text: '#b06000', bar: '#f29900', label: 'Partial' },
  draft: { bg: '#f1f3f4', text: '#5f6368', bar: '#80868b', label: 'Draft' },
  paused: { bg: '#fef7e0', text: '#b06000', bar: '#f29900', label: 'Paused' },
  frequency_capped: { bg: '#fff7ed', text: '#c2410c', bar: '#ea580c', label: 'Freq Capped' },
};

function BroadcastCalendar({
  broadcasts,
  onDayClick,
  onNewCampaignOnDate,
}: {
  broadcasts: any[];
  onDayClick: (bId: string) => void;
  onNewCampaignOnDate?: (dateStr?: string) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'agenda'>('month');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerDate, setDrawerDate] = useState<Date | null>(null);
  const [hoveredCampaign, setHoveredCampaign] = useState<any | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  // Filtered broadcasts
  const filteredBroadcasts = useMemo(() => {
    return (broadcasts || []).filter((b: any) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (b.name || '').toLowerCase();
        const tmpl = (b.templateName || '').toLowerCase();
        if (!name.includes(q) && !tmpl.includes(q)) return false;
      }
      return true;
    });
  }, [broadcasts, statusFilter, searchQuery]);

  // Aggregate monthly stats
  const monthlyMetrics = useMemo(() => {
    let scheduled = 0;
    let sending = 0;
    let completed = 0;
    let totalAudience = 0;

    (broadcasts || []).forEach((b: any) => {
      const bDate = new Date(b.scheduledAt || b.createdAt);
      if (isSameMonth(bDate, currentMonth)) {
        if (b.status === 'scheduled') scheduled++;
        else if (b.status === 'sending') sending++;
        else if (b.status === 'sent') completed++;
        totalAudience += (b.stats?.total || b.csvAudience?.length || 0);
      }
    });

    return { scheduled, sending, completed, totalAudience };
  }, [broadcasts, currentMonth]);

  // Broadcasts grouped by YYYY-MM-DD
  const broadcastsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredBroadcasts.forEach((b: any) => {
      const dateKey = b.scheduledAt
        ? format(new Date(b.scheduledAt), 'yyyy-MM-dd')
        : format(new Date(b.createdAt), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(b);
    });
    return map;
  }, [filteredBroadcasts]);

  // Sorted list for Agenda View
  const agendaList = useMemo(() => {
    return [...filteredBroadcasts].sort((a, b) => {
      const dA = new Date(a.scheduledAt || a.createdAt).getTime();
      const dB = new Date(b.scheduledAt || b.createdAt).getTime();
      return dB - dA;
    });
  }, [filteredBroadcasts]);

  const drawerCampaigns = useMemo(() => {
    if (!drawerDate) return [];
    const dateKey = format(drawerDate, 'yyyy-MM-dd');
    return broadcastsByDate[dateKey] || [];
  }, [drawerDate, broadcastsByDate]);

  // Grid padding & days array math for Google Matrix
  const gridCells = useMemo(() => {
    const cells: { date: Date | null; isPadding: boolean }[] = [];
    for (let i = 0; i < startPadding; i++) {
      cells.push({ date: null, isPadding: true });
    }
    daysInMonth.forEach(d => cells.push({ date: d, isPadding: false }));
    while (cells.length % 7 !== 0) {
      cells.push({ date: null, isPadding: true });
    }
    return cells;
  }, [startPadding, daysInMonth]);

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #dadce0',
      boxShadow: '0 1px 6px rgba(60, 64, 67, 0.1)',
      padding: '20px',
      marginBottom: '28px',
      position: 'relative'
    }}>

      {/* ── Top Header Toolbar (Google Calendar Styling) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          
          {/* Left: Floating Action Create + Today + Nav + Month Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {onNewCampaignOnDate && (
              <button
                onClick={() => onNewCampaignOnDate()}
                style={{
                  background: '#ffffff', color: '#3c4043', border: '1px solid #dadce0',
                  borderRadius: '24px', padding: '8px 20px', fontSize: '13px', fontWeight: '700',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                  boxShadow: '0 1px 3px rgba(60,64,67,0.3)', transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(60,64,67,0.25)';
                  e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(60,64,67,0.3)';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                <Plus size={18} color="#1a73e8" />
                <span>Create</span>
              </button>
            )}

            <button
              onClick={() => setCurrentMonth(new Date())}
              style={{
                background: '#ffffff', border: '1px solid #dadce0', borderRadius: '6px', padding: '6px 14px',
                fontSize: '13px', fontWeight: '600', color: '#3c4043', cursor: 'pointer', transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f3f4'}
              onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
            >
              Today
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                style={{ background: 'none', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#5f6368', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f4'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                style={{ background: 'none', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#5f6368', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f4'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#3c4043', fontFamily: 'sans-serif' }}>
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
          </div>

          {/* Center: View Switcher Segmented Control */}
          <div style={{ display: 'flex', background: '#f1f3f4', padding: '2px', borderRadius: '8px', border: '1px solid #dadce0' }}>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              style={{
                padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: 'none', cursor: 'pointer',
                background: viewMode === 'month' ? '#ffffff' : 'transparent',
                color: viewMode === 'month' ? '#1a73e8' : '#5f6368',
                boxShadow: viewMode === 'month' ? '0 1px 2px rgba(60,64,67,0.3)' : 'none',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
              }}
            >
              <Grid size={13} /> Month
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              style={{
                padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: 'none', cursor: 'pointer',
                background: viewMode === 'week' ? '#ffffff' : 'transparent',
                color: viewMode === 'week' ? '#1a73e8' : '#5f6368',
                boxShadow: viewMode === 'week' ? '0 1px 2px rgba(60,64,67,0.3)' : 'none',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
              }}
            >
              <CalendarDays size={13} /> Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              style={{
                padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: 'none', cursor: 'pointer',
                background: viewMode === 'agenda' ? '#ffffff' : 'transparent',
                color: viewMode === 'agenda' ? '#1a73e8' : '#5f6368',
                boxShadow: viewMode === 'agenda' ? '0 1px 2px rgba(60,64,67,0.3)' : 'none',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
              }}
            >
              <List size={13} /> Agenda
            </button>
          </div>
        </div>

        {/* Filter Bar & KPI Summary Strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', borderTop: '1px solid #f1f3f4' }}>
          
          {/* Status Filter & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Filter size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#80868b' }} />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  paddingLeft: '28px', paddingRight: '24px', paddingTop: '5px', paddingBottom: '5px',
                  borderRadius: '6px', border: '1px solid #dadce0', background: '#ffffff', fontSize: '12px', fontWeight: '500', color: '#3c4043', cursor: 'pointer'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="scheduled">🟡 Scheduled</option>
                <option value="sending">🔵 Active Sending</option>
                <option value="sent">🟢 Completed</option>
                <option value="draft">⚪ Draft</option>
                <option value="failed">🔴 Failed / Partial</option>
              </select>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#80868b' }} />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: '28px', paddingRight: '10px', paddingTop: '5px', paddingBottom: '5px',
                  borderRadius: '6px', border: '1px solid #dadce0', background: '#ffffff', fontSize: '12px', width: '170px'
                }}
              />
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: '600' }}>
            <span style={{ background: '#fef7e0', color: '#b06000', padding: '3px 10px', borderRadius: '12px', border: '1px solid #f29900', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={12} /> {monthlyMetrics.scheduled} Scheduled
            </span>
            <span style={{ background: '#e8f0fe', color: '#1a73e8', padding: '3px 10px', borderRadius: '12px', border: '1px solid #aecbfa', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Loader2 size={12} className="animate-spin" /> {monthlyMetrics.sending} Active
            </span>
            <span style={{ background: '#e6f4ea', color: '#137333', padding: '3px 10px', borderRadius: '12px', border: '1px solid #a8dab5', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <CheckCircle2 size={12} /> {monthlyMetrics.completed} Completed
            </span>
            <span style={{ background: '#f1f3f4', color: '#5f6368', padding: '3px 10px', borderRadius: '12px', border: '1px solid #dadce0', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Users size={12} /> {monthlyMetrics.totalAudience.toLocaleString()} Target
            </span>
          </div>
        </div>
      </div>

      {/* ── VIEW 1: GOOGLE CALENDAR UNIFIED MATRIX MONTH GRID ── */}
      {viewMode === 'month' && (
        <div style={{
          border: '1px solid #dadce0',
          borderRadius: '12px',
          overflow: 'hidden',
          background: '#ffffff'
        }}>
          {/* Day Headers Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#ffffff', borderBottom: '1px solid #dadce0' }}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, idx) => (
              <div
                key={day}
                style={{
                  textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#70757a',
                  padding: '10px 0', borderRight: idx < 6 ? '1px solid #dadce0' : 'none', letterSpacing: '0.6px'
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid Cells Container */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {gridCells.map((cell, idx) => {
              if (cell.isPadding || !cell.date) {
                const colIdx = idx % 7;
                const rowIdx = Math.floor(idx / 7);
                const totalRows = gridCells.length / 7;
                return (
                  <div
                    key={`pad-${idx}`}
                    style={{
                      minHeight: '115px',
                      background: '#f8fafc',
                      borderRight: colIdx < 6 ? '1px solid #dadce0' : 'none',
                      borderBottom: rowIdx < totalRows - 1 ? '1px solid #dadce0' : 'none',
                      opacity: 0.5
                    }}
                  />
                );
              }

              const day = cell.date;
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayBroadcasts = broadcastsByDate[dateKey] || [];
              const isToday = isSameDay(day, new Date());
              const colIdx = idx % 7;
              const rowIdx = Math.floor(idx / 7);
              const totalRows = gridCells.length / 7;
              const dayNum = format(day, 'd');
              const isFirstOfMonth = dayNum === '1';

              return (
                <div
                  key={dateKey}
                  onClick={() => setDrawerDate(day)}
                  style={{
                    minHeight: '115px',
                    padding: '6px 8px',
                    background: isToday ? '#f8fafd' : '#ffffff',
                    borderRight: colIdx < 6 ? '1px solid #dadce0' : 'none',
                    borderBottom: rowIdx < totalRows - 1 ? '1px solid #dadce0' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isToday ? '#edf4fe' : '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = isToday ? '#f8fafd' : '#ffffff'}
                >
                  {/* Date Badge Top Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    {isToday ? (
                      <span style={{
                        background: '#1a73e8', color: '#ffffff', borderRadius: '50%',
                        width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: '700', fontSize: '12px'
                      }}>
                        {dayNum}
                      </span>
                    ) : isFirstOfMonth ? (
                      <span style={{ fontWeight: '700', fontSize: '12px', color: '#3c4043' }}>
                        {format(day, 'MMM d')}
                      </span>
                    ) : (
                      <span style={{ fontWeight: '600', fontSize: '12px', color: '#3c4043', marginLeft: '4px' }}>
                        {dayNum}
                      </span>
                    )}

                    {dayBroadcasts.length > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: '600', color: '#70757a', background: '#f1f3f4', padding: '1px 6px', borderRadius: '10px' }}>
                        {dayBroadcasts.length}
                      </span>
                    )}
                  </div>

                  {/* Google Style Event Chips */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    {dayBroadcasts.slice(0, 3).map((b: any) => {
                      const chipStyle = GOOGLE_CHIP_STYLES[b.status as string] || GOOGLE_CHIP_STYLES.draft;
                      const isSending = b.status === 'sending';
                      const timeStr = b.scheduledAt ? format(new Date(b.scheduledAt), 'HH:mm') : '•';
                      return (
                        <div
                          key={b._id}
                          onClick={(e) => { e.stopPropagation(); onDayClick(b._id); }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredCampaign(b);
                            setPopoverPos({ x: rect.left, y: rect.bottom + 6 });
                          }}
                          onMouseLeave={() => setHoveredCampaign(null)}
                          style={{
                            background: chipStyle.bg,
                            color: chipStyle.text,
                            borderLeft: `4px solid ${chipStyle.bar}`,
                            borderRadius: '4px',
                            padding: '3px 6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                          }}
                          onMouseOver={e => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'}
                          onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'}
                        >
                          {isSending ? (
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1a73e8', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
                          ) : (
                            <span style={{ fontSize: '10px', opacity: 0.85, flexShrink: 0 }}>{timeStr}</span>
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {b.name}
                          </span>
                        </div>
                      );
                    })}

                    {dayBroadcasts.length > 3 && (
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#1a73e8', padding: '1px 4px', borderRadius: '4px' }}>
                        + {dayBroadcasts.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VIEW 2: AGENDA SCHEDULE TIMELINE ── */}
      {viewMode === 'agenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid #dadce0', borderRadius: '12px', padding: '16px', background: '#ffffff' }}>
          {agendaList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#70757a' }}>
              <Megaphone size={32} style={{ marginBottom: '8px' }} />
              <div>No campaigns found matching current filters.</div>
            </div>
          ) : (
            agendaList.map((b: any) => {
              const chipStyle = GOOGLE_CHIP_STYLES[b.status as string] || GOOGLE_CHIP_STYLES.draft;
              const scheduledDate = new Date(b.scheduledAt || b.createdAt);
              return (
                <div
                  key={b._id}
                  onClick={() => onDayClick(b._id)}
                  style={{
                    background: '#ffffff', borderRadius: '8px', border: '1px solid #dadce0', borderLeft: `6px solid ${chipStyle.bar}`,
                    padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(60,64,67,0.15)';
                    e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ textAlign: 'center', minWidth: '65px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#70757a', textTransform: 'uppercase' }}>
                        {format(scheduledDate, 'EEE, MMM d')}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#202124', marginTop: '2px' }}>
                        {format(scheduledDate, 'HH:mm')}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#202124', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{b.name}</span>
                        <span style={{ background: chipStyle.bg, color: chipStyle.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                          {chipStyle.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#5f6368', marginTop: '4px', display: 'flex', gap: '16px' }}>
                        <span>📝 Template: <code>{b.templateName}</code></span>
                        <span>🎯 Audience: <strong>{(b.stats?.total || b.csvAudience?.length || 0).toLocaleString()}</strong> contacts</span>
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={(e) => { e.stopPropagation(); onDayClick(b._id); }}
                  >
                    <Eye size={14} /> Details
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── VIEW 3: WEEKLY TIME SLOTS ── */}
      {viewMode === 'week' && (
        <div style={{ border: '1px solid #dadce0', borderRadius: '12px', overflow: 'hidden', background: '#ffffff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #dadce0' }}>
            {daysInMonth.slice(0, 7).map((day, idx) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div key={idx} style={{ textAlign: 'center', padding: '10px 0', borderRight: idx < 6 ? '1px solid #dadce0' : 'none' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#70757a' }}>{format(day, 'EEE')}</div>
                  <div style={{
                    fontSize: '14px', fontWeight: '700', color: isToday ? '#ffffff' : '#202124',
                    background: isToday ? '#1a73e8' : 'transparent', borderRadius: '50%',
                    width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px'
                  }}>
                    {format(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: '300px' }}>
            {daysInMonth.slice(0, 7).map((day, idx) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayBroadcasts = broadcastsByDate[dateKey] || [];
              return (
                <div key={idx} style={{ padding: '8px', borderRight: idx < 6 ? '1px solid #dadce0' : 'none', background: '#ffffff' }}>
                  {dayBroadcasts.length === 0 ? (
                    <div style={{ fontSize: '11px', color: '#9aa0a6', textAlign: 'center', marginTop: '40px' }}>No events</div>
                  ) : (
                    dayBroadcasts.map((b: any) => {
                      const chipStyle = GOOGLE_CHIP_STYLES[b.status as string] || GOOGLE_CHIP_STYLES.draft;
                      return (
                        <div
                          key={b._id}
                          onClick={() => onDayClick(b._id)}
                          style={{
                            background: chipStyle.bg, color: chipStyle.text, borderLeft: `4px solid ${chipStyle.bar}`,
                            borderRadius: '4px', padding: '6px 8px', fontSize: '11px', fontWeight: '600', marginBottom: '6px', cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontWeight: '700' }}>{b.name}</div>
                          <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px' }}>
                            {b.scheduledAt ? format(new Date(b.scheduledAt), 'HH:mm') : 'Draft'}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Slide-Over Day Drawer ── */}
      {drawerDate && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            justifyContent: 'flex-end',
            padding: 0
          }}
          onClick={() => setDrawerDate(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '440px',
              maxWidth: '90vw',
              height: '100vh',
              background: '#ffffff',
              boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.2)',
              borderLeft: '1px solid #dadce0',
              padding: '24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100000,
              animation: 'slideInRight 0.25s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #dadce0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#202124' }}>
                  📅 {format(drawerDate, 'MMMM d, yyyy')}
                </h3>
                <span style={{ fontSize: '12px', color: '#5f6368' }}>{drawerCampaigns.length} campaigns scheduled for this date</span>
              </div>
              <button onClick={() => setDrawerDate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f6368' }}>
                <X size={20} />
              </button>
            </div>

            {onNewCampaignOnDate && (
              <button
                onClick={() => { setDrawerDate(null); onNewCampaignOnDate(format(drawerDate, 'yyyy-MM-dd')); }}
                style={{
                  width: '100%', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px',
                  padding: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginBottom: '20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 1px 3px rgba(60,64,67,0.3)'
                }}
              >
                <Plus size={16} /> Schedule Campaign on {format(drawerDate, 'MMM d')}
              </button>
            )}

            {drawerCampaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#70757a' }}>
                <Calendar size={36} style={{ marginBottom: '8px' }} />
                <div>No campaigns scheduled on this day.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {drawerCampaigns.map((b: any) => {
                  const chipStyle = GOOGLE_CHIP_STYLES[b.status as string] || GOOGLE_CHIP_STYLES.draft;
                  return (
                    <div key={b._id} style={{ background: chipStyle.bg, border: '1px solid #dadce0', borderLeft: `5px solid ${chipStyle.bar}`, borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#202124' }}>{b.name}</div>
                        <span style={{ background: 'white', color: chipStyle.text, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700' }}>
                          {chipStyle.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#5f6368' }}>
                        Template: <code>{b.templateName}</code>
                      </div>
                      <div style={{ fontSize: '12px', color: '#5f6368' }}>
                        Target Audience: <strong>{(b.stats?.total || b.csvAudience?.length || 0).toLocaleString()}</strong> contacts
                      </div>
                      <button
                        className="btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: chipStyle.bar }}
                        onClick={() => { setDrawerDate(null); onDayClick(b._id); }}
                      >
                        <Eye size={13} /> View Delivery Diagnostics
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Interactive Google Hover Popover Card ── */}
      {hoveredCampaign && popoverPos && (
        <div style={{
          position: 'fixed',
          left: Math.min(popoverPos.x, window.innerWidth - 300),
          top: Math.min(popoverPos.y, window.innerHeight - 200),
          width: '280px',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(60,64,67,0.25)',
          border: '1px solid #dadce0',
          padding: '16px',
          zIndex: 1500,
          pointerEvents: 'none',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: GOOGLE_CHIP_STYLES[hoveredCampaign.status as string]?.bar || '#1a73e8' }} />
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#202124', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {hoveredCampaign.name}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#5f6368', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>📅 Schedule: <strong>{hoveredCampaign.scheduledAt ? format(new Date(hoveredCampaign.scheduledAt), 'MMM d, yyyy @ HH:mm') : 'Immediate / Draft'}</strong></div>
            <div>📝 Template: <code>{hoveredCampaign.templateName}</code></div>
            <div>🎯 Reach: <strong>{(hoveredCampaign.stats?.total || hoveredCampaign.csvAudience?.length || 0).toLocaleString()} contacts</strong></div>
            <div>📊 Status: <span style={{ textTransform: 'capitalize', fontWeight: '700', color: GOOGLE_CHIP_STYLES[hoveredCampaign.status as string]?.text }}>{hoveredCampaign.status}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function BroadcastModal({ broadcast, onClose, onSave }: any) {
  const [step, setStep] = useState<1 | 2>(1);
  const [audienceType, setAudienceType] = useState<'tags' | 'csv' | 'segment'>(broadcast?.audienceType || 'tags');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>(broadcast?.segmentId || '');
  const [selectedSegmentName, setSelectedSegmentName] = useState<string>(broadcast?.segmentName || '');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParseData, setCsvParseData] = useState<any>(null);
  const [csvParsing, setCsvParsing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesText, setUploadBytesText] = useState('');

  // Per-parameter mapping mode: 'csv' column OR 'static' manual value
  const [paramModes, setParamModes] = useState<Record<string, 'csv' | 'static'>>({});
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [buttonParamModes, setButtonParamModes] = useState<Record<number, 'csv' | 'static'>>({});
  const [buttonParamValues, setButtonParamValues] = useState<Record<number, string>>({});

  // Dispatch & Schedule options
  const [dispatchMode, setDispatchMode] = useState<'immediate' | 'scheduled' | 'recurring'>(
    broadcast?.scheduledAt ? 'scheduled' : broadcast?.recurringSchedule && broadcast.recurringSchedule !== 'none' ? 'recurring' : 'immediate'
  );
  const [recurringSchedule, setRecurringSchedule] = useState<string>(broadcast?.recurringSchedule || 'daily');

  const [form, setForm] = useState(broadcast || {
    name: '', templateName: '', templateLanguage: 'en', audienceTags: [], scheduledAt: '',
    headerMediaUrl: '', headerMediaId: '', bodyParams: [], buttonParams: [], carouselCards: [],
    audienceType: 'tags', csvAudience: null, recurringSchedule: 'none', category: 'MARKETING', estimatedCost: 0,
  });

  const TAGS = ['Regular Customer', 'VIP Customer', 'Vegetarian', 'Birthday Customer', 'Catering Inquiry'];

  const { data: segmentsList } = useQuery({
    queryKey: ['customer-segments'],
    queryFn: () => api.get('/api/segments').then(r => r.data.segments || []),
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/messaging/templates').then(r => r.data)
  });

  const { data: mediaData } = useQuery({
    queryKey: ['media'],
    queryFn: () => api.get('/api/media').then(r => r.data),
  });

  const approvedTemplates = templatesData?.templates?.filter((t: any) => t.status === 'APPROVED') || [];
  const mediaList = mediaData?.media || [];

  // Extract all unique variable slots (positional {{1}} or named {{customer_name}})
  const extractVarSlots = (text?: string) => {
    if (!text) return [];
    const matches = Array.from(text.matchAll(/\{\{([^}]+)\}\}/g), m => m[1]);
    return Array.from(new Set(matches));
  };

  const [headerMediaMode, setHeaderMediaMode] = useState<'upload' | 'url'>('upload');
  const [headerUploading, setHeaderUploading] = useState(false);

  const selectedTemplate = approvedTemplates.find((t: any) => t.name === form.templateName);
  const selectedComponents: any[] = selectedTemplate?.components || [];
  const headerComp = selectedComponents.find((c: any) => c.type === 'HEADER');
  const bodyComp = selectedComponents.find((c: any) => c.type === 'BODY');
  const footerComp = selectedComponents.find((c: any) => c.type === 'FOOTER');
  const buttonsComp = selectedComponents.find((c: any) => c.type === 'BUTTONS');

  const needsHeaderMedia = headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format);
  const headerVarSlots = headerComp?.format === 'TEXT' ? extractVarSlots(headerComp?.text) : [];
  const bodyVarSlots = extractVarSlots(bodyComp?.text);
  const templateCategory = selectedTemplate?.category || 'MARKETING';

  // Cost calculation
  const categoryRateMap: Record<string, number> = {
    MARKETING: 0.88,
    UTILITY: 0.14,
    AUTHENTICATION: 0.14,
  };
  const ratePerMsg = categoryRateMap[templateCategory] || 0.88;
  const totalRecipientsCount = audienceType === 'csv' ? (csvParseData?.total_rows || 0) : 100;
  const calculatedCost = (totalRecipientsCount * ratePerMsg).toFixed(2);

  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);

  // Preview header image: prefer local object URL if file selected, else form.headerMediaUrl
  const previewHeaderImg = useMemo(() => {
    if (headerMediaFile) {
      try {
        return URL.createObjectURL(headerMediaFile);
      } catch (e) {
        return '';
      }
    }
    return form.headerMediaUrl?.trim() || '';
  }, [headerMediaFile, form.headerMediaUrl]);

  const handleTemplateSelect = (name: string) => {
    const selected = approvedTemplates.find((t: any) => t.name === name);
    setHeaderMediaFile(null);
    const updatedForm = {
      ...form,
      templateName: name,
      templateLanguage: selected?.language || form.templateLanguage,
      templateComponents: selected?.components || [],
      headerMediaUrl: '',
      headerMediaId: '',
      bodyParams: [],
      buttonParams: [],
      carouselCards: [],
      category: selected?.category || 'MARKETING',
    };

    if (selected?.components) {
      const body = selected.components.find((c: any) => c.type === 'BODY');
      const vars = extractVarSlots(body?.text);
      
      const newModes: Record<string, 'csv' | 'static'> = {};
      const newVals: Record<string, string> = {};

      vars.forEach((vName: string, idx: number) => {
        newModes[vName] = audienceType === 'csv' ? 'csv' : 'static';
        if (csvParseData?.headers) {
          const matchCol = csvParseData.headers.find(
            (h: string) => h.toLowerCase() === vName.toLowerCase() || (vName.toLowerCase().includes('name') && h.toLowerCase().includes('name'))
          ) || csvParseData.headers[idx] || '';
          newVals[vName] = matchCol;
        }
      });
      setParamModes(newModes);
      setParamValues(newVals);
    }

    setForm(updatedForm);
  };

  const toggleTag = (tag: string) => {
    setForm((f: any) => ({
      ...f,
      audienceTags: f.audienceTags.includes(tag) ? f.audienceTags.filter((t: string) => t !== tag) : [...f.audienceTags, tag],
    }));
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvParsing(true);
    setUploadProgress(0);
    const totalMb = (file.size / (1024 * 1024)).toFixed(2);
    setUploadBytesText(`0 MB of ${totalMb} MB`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/broadcasts/parse-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
            const loadedMb = (progressEvent.loaded / (1024 * 1024)).toFixed(2);
            setUploadBytesText(`${loadedMb} MB of ${totalMb} MB`);
          }
        }
      });
      setCsvParseData(res.data);

      const initialModes: Record<string, 'csv' | 'static'> = {};
      const initialVals: Record<string, string> = {};

      bodyVarSlots.forEach((vName: string, idx: number) => {
        initialModes[vName] = 'csv';
        if (res.data.headers) {
          const matchCol = res.data.headers.find(
            (h: string) => h.toLowerCase() === vName.toLowerCase() || (vName.toLowerCase().includes('name') && h.toLowerCase().includes('name'))
          ) || res.data.headers[idx] || '';
          initialVals[vName] = matchCol;
        }
      });
      setParamModes(initialModes);
      setParamValues(initialVals);
      toast.success(`Loaded ${res.data.total_rows} recipients from ${file.name}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to parse CSV file');
    } finally {
      setCsvParsing(false);
    }
  };

  const renderMockupBodyText = () => {
    if (!bodyComp?.text) return 'Select a Meta template to view preview...';
    let text = bodyComp.text;
    const firstRow = csvParseData?.parsed_recipients?.[0] || csvParseData?.preview_rows?.[0];

    bodyVarSlots.forEach((vName: string) => {
      const key = `{{${vName}}}`;
      const mode = paramModes[vName] || (audienceType === 'csv' ? 'csv' : 'static');
      let val = '';
      if (mode === 'csv' && firstRow) {
        const col = paramValues[vName];
        val = col ? firstRow.raw_row[col] || key : key;
      } else {
        val = paramValues[vName] || key;
      }
      text = text.replaceAll(key, val || key);
    });
    return text;
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error('Please enter a campaign name');
      return;
    }
    if (!form.templateName) {
      toast.error('Please select a Meta template');
      return;
    }
    if (needsHeaderMedia && !form.headerMediaUrl && !headerMediaFile) {
      toast.error(`Please select or upload a header ${headerComp.format}`);
      return;
    }

    let finalHeaderMediaUrl = form.headerMediaUrl;

    // Upload header media file if selected
    if (needsHeaderMedia && headerMediaFile) {
      try {
        const formData = new FormData();
        formData.append('file', headerMediaFile);
        const res = await api.post('/api/media/upload', formData);
        const rawUrl = res.data?.url || res.data?.media?.url || '';
        if (!rawUrl) {
          toast.error('Failed to parse uploaded media URL');
          return;
        }
        finalHeaderMediaUrl = rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`;
      } catch (err: any) {
        toast.error(getErrorMessage(err, 'Failed to upload header media'));
        return;
      }
    }

    let finalCsvAudience = null;
    const finalBodyParams: string[] = [];
    const finalButtonParams: string[] = [];

    bodyVarSlots.forEach((vName: string) => {
      const val = paramValues[vName] || '';
      finalBodyParams.push(val);
    });

    if (buttonsComp?.buttons) {
      buttonsComp.buttons.forEach((_: any, idx: number) => {
        const val = buttonParamValues[idx] || '';
        finalButtonParams.push(val);
      });
    }

    if (audienceType === 'csv' && csvParseData?.parsed_recipients) {
      finalCsvAudience = csvParseData.parsed_recipients.map((rec: any) => {
        const customParams: string[] = [];
        bodyVarSlots.forEach((vName: string) => {
          const mode = paramModes[vName] || 'csv';
          if (mode === 'csv') {
            const col = paramValues[vName];
            customParams.push(col ? rec.raw_row[col] || '' : rec.name);
          } else {
            customParams.push(paramValues[vName] || '');
          }
        });
        return {
          phone: rec.phone,
          name: rec.name,
          params: customParams.length > 0 ? customParams : rec.params,
        };
      });
    }

    const saveData = {
      ...form,
      headerMediaUrl: finalHeaderMediaUrl,
      audienceType,
      segmentId: audienceType === 'segment' ? selectedSegmentId : undefined,
      segmentName: audienceType === 'segment' ? selectedSegmentName : undefined,
      csvAudience: finalCsvAudience,
      bodyParams: finalBodyParams,
      buttonParams: finalButtonParams,
      category: templateCategory,
      estimatedCost: parseFloat(calculatedCost),
      scheduledAt: dispatchMode === 'scheduled' ? form.scheduledAt : undefined,
      recurringSchedule: dispatchMode === 'recurring' ? recurringSchedule : 'none',
      templateComponents: selectedComponents.length > 0 ? selectedComponents : undefined,
    };
    onSave(saveData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '95vw', maxWidth: step === 1 ? '720px' : '1180px', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box', transition: 'all 0.25s' }}>
        
        
        {/* Modal Header with Wizard Progress */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', pb: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Megaphone size={20} style={{ color: '#1B5E37' }} />
              {broadcast ? 'Edit Campaign' : 'Create New Campaign'}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Step {step} of 2 — {step === 1 ? 'Select Audience & Contact Normalization' : 'Template, Mockup & Scheduling'}</span>
          </div>

          {/* Step Pills */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: 'none', cursor: 'pointer',
                background: step === 1 ? '#1B5E37' : '#e2e8f0', color: step === 1 ? 'white' : '#475569',
              }}
            >
              1. Audience Preview
            </button>
            <span style={{ color: '#cbd5e1' }}>→</span>
            <button
              type="button"
              onClick={() => {
                if (audienceType === 'csv' && !csvParseData) {
                  toast.error('Please upload a CSV file first');
                  return;
                }
                if (audienceType === 'segment' && !selectedSegmentId) {
                  toast.error('Please select a Customer Segment');
                  return;
                }
                setStep(2);
              }}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: 'none', cursor: 'pointer',
                background: step === 2 ? '#1B5E37' : '#e2e8f0', color: step === 2 ? 'white' : '#475569',
              }}
            >
              2. Template & Mockup
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', marginLeft: '12px' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── STEP 1: AUDIENCE & CONTACT NORMALIZATION PREVIEW ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Campaign Name *</label>
              <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Diwali Weekend Special Offer" />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>
                Select Target Audience Mode
              </label>
              <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                <button
                  type="button"
                  onClick={() => setAudienceType('tags')}
                  style={{
                    flex: 1, padding: '10px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    background: audienceType === 'tags' ? 'white' : 'transparent',
                    color: audienceType === 'tags' ? '#0f172a' : '#64748b',
                    boxShadow: audienceType === 'tags' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  🏷️ Filter by Audience Tags
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceType('segment')}
                  style={{
                    flex: 1, padding: '10px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    background: audienceType === 'segment' ? 'white' : 'transparent',
                    color: audienceType === 'segment' ? '#0f172a' : '#64748b',
                    boxShadow: audienceType === 'segment' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  🎯 Customer Segment
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceType('csv')}
                  style={{
                    flex: 1, padding: '10px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    background: audienceType === 'csv' ? 'white' : 'transparent',
                    color: audienceType === 'csv' ? '#0f172a' : '#64748b',
                    boxShadow: audienceType === 'csv' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  📄 Upload CSV Contact List
                </button>
              </div>
            </div>

            {audienceType === 'segment' && (
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Select Customer Segment Target
                </label>
                <select
                  value={selectedSegmentId}
                  onChange={e => {
                    const segId = e.target.value;
                    setSelectedSegmentId(segId);
                    const found = (segmentsList || []).find((s: any) => s._id === segId);
                    if (found) setSelectedSegmentName(found.name);
                  }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff' }}
                >
                  <option value="">-- Choose a Segment --</option>
                  {(segmentsList || []).map((seg: any) => (
                    <option key={seg._id} value={seg._id}>
                      {seg.name} ({seg.totalCount || 0} contacts) — {seg.source === 'csv_upload' ? 'CSV Upload' : 'CRM Selection'}
                    </option>
                  ))}
                </select>

                {selectedSegmentId && (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#15803d', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={15} /> Targeted Segment: <strong>{selectedSegmentName}</strong> pre-loaded as audience target.
                  </div>
                )}
              </div>
            )}

            {audienceType === 'tags' && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'block', marginBottom: '8px' }}>
                  Select Customer Tags <span style={{ color: '#9ca3af' }}>(leave unselected to target All Customers)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {TAGS.map(tag => (
                    <button key={tag} type="button" onClick={() => toggleTag(tag)} style={{
                      padding: '8px 14px', borderRadius: '20px', border: '1.5px solid', fontSize: '12px', cursor: 'pointer', fontWeight: '500',
                      background: form.audienceTags.includes(tag) ? '#1B5E37' : 'white',
                      color: form.audienceTags.includes(tag) ? 'white' : '#374151',
                      borderColor: form.audienceTags.includes(tag) ? '#1B5E37' : '#e5e7eb',
                    }}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {audienceType === 'csv' && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px dashed #cbd5e1' }}>
                <input
                  type="file"
                  accept=".csv"
                  id="csv-file-input"
                  onChange={handleCsvUpload}
                  style={{ display: 'none' }}
                />

                {csvParsing ? (
                  <div style={{
                    padding: '24px', background: 'white', borderRadius: '10px', border: '2px solid #3b82f6',
                    textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1d4ed8', fontWeight: '700', fontSize: '15px' }}>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Uploading & Normalizing Contact List... ({uploadProgress}%)</span>
                    </div>
                    
                    <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${uploadProgress}%`, height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                        borderRadius: '10px', transition: 'width 0.2s ease-in-out'
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                      <span>File: {csvFile?.name}</span>
                      <span>{uploadBytesText || `${uploadProgress}%`}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: '600' }}>
                      ⚡ Normalizing E.164 phone numbers & mapping columns in real time...
                    </span>
                  </div>
                ) : !csvParseData ? (
                  <label
                    htmlFor="csv-file-input"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      padding: '24px', background: 'white', borderRadius: '10px', border: '2px dashed #94a3b8',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                    }}
                  >
                    <Upload size={28} color="#64748b" style={{ marginBottom: '8px' }} />
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                      Click to Upload Contact List (.CSV)
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Supports columns: phone, name, param1, param2, etc. Normalizes phone numbers automatically.
                    </span>
                  </label>
                ) : (
                  <div style={{ background: 'white', borderRadius: '10px', padding: '12px 16px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={24} style={{ color: '#166534' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{csvFile ? csvFile.name : 'Uploaded Contact List'}</div>
                        <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>✅ Loaded & normalized {csvParseData.parsed_recipients.length} recipients</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <label
                        htmlFor="csv-file-input"
                        style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', background: '#f1f5f9', color: '#334155', borderRadius: '6px', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                      >
                        🔄 Replace File
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCsvFile(null);
                          setCsvParseData(null);
                          setParamModes({});
                          setParamValues({});
                          toast.success('Removed CSV file');
                        }}
                        style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', border: '1px solid #fca5a5' }}
                      >
                        🗑️ Remove File
                      </button>
                    </div>
                  </div>
                )}

                {/* Scrollable & Fast Preview Table for High Volume Contacts */}
                {csvParseData?.parsed_recipients && (
                  <div style={{ marginTop: '16px', background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                          📋 Verified Contact List ({csvParseData.parsed_recipients.length.toLocaleString()} Total Contacts Loaded)
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                          Showing preview of first 50 contacts (editing enabled for preview rows)
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: '12px', fontWeight: '700' }}>
                        {csvParseData.parsed_recipients.length.toLocaleString()} Valid WhatsApp Contacts
                      </span>
                    </div>

                    {/* Scrollable Container */}
                    <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                          <tr style={{ textTransform: 'uppercase', fontSize: '10px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '30%' }}>Recipient Name</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '35%' }}>Normalized Phone</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '25%' }}>Dynamic Attributes</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '10%' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvParseData.parsed_recipients.slice(0, 50).map((row: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  className="input-field"
                                  style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontWeight: '600' }}
                                  value={row.name}
                                  onChange={e => {
                                    const updated = [...csvParseData.parsed_recipients];
                                    updated[i] = { ...updated[i], name: e.target.value };
                                    setCsvParseData({ ...csvParseData, parsed_recipients: updated });
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  className="input-field"
                                  style={{ padding: '4px 8px', fontSize: '12px', fontFamily: 'monospace', color: '#2563eb', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                  value={row.phone}
                                  onChange={e => {
                                    const updated = [...csvParseData.parsed_recipients];
                                    updated[i] = { ...updated[i], phone: e.target.value };
                                    setCsvParseData({ ...csvParseData, parsed_recipients: updated });
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px', color: '#64748b', fontSize: '11px' }}>
                                {row.params?.length > 0 ? row.params.slice(0, 2).join(', ') : 'Default'}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = csvParseData.parsed_recipients.filter((_: any, idx: number) => idx !== i);
                                    setCsvParseData({ ...csvParseData, parsed_recipients: updated, total_rows: updated.length });
                                    toast.success('Removed contact');
                                  }}
                                  title="Remove contact"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 1 Footer Navigation */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (!form.name) {
                    toast.error('Please enter a campaign name first');
                    return;
                  }
                  if (audienceType === 'csv' && !csvParseData) {
                    toast.error('Please upload a CSV contact list');
                    return;
                  }
                  setStep(2);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Next: Select Template & Parameters <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: TEMPLATE, PER-PARAMETER MAPPER, WHATSAPP MOCKUP, SCHEDULING & COST ESTIMATOR ── */}
        {step === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 310px', gap: '20px', alignItems: 'start' }}>
            
            {/* Left Column: Form & Parameter Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Template Selection */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                  Select Meta Approved Template *
                </label>
                <select
                  className="input-field"
                  style={{ padding: '10px 14px', fontSize: '14px', backgroundColor: '#f9fafb', cursor: 'pointer' }}
                  value={form.templateName}
                  onChange={e => handleTemplateSelect(e.target.value)}
                >
                  <option value="" disabled>✨ Choose Meta Template</option>
                  {approvedTemplates.map((t: any) => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.category || 'MARKETING'} — {t.language})
                    </option>
                  ))}
                </select>
              </div>

              {/* Header Media Upload (if required) */}
              {needsHeaderMedia && (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    {headerComp.format === 'IMAGE' ? '🖼️ Header Image' : headerComp.format === 'VIDEO' ? '🎬 Header Video' : '📄 Header Document'}
                  </label>

                  {/* Select from Media Library */}
                  {headerComp.format === 'IMAGE' && mediaList.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '8px', fontWeight: '500' }}>Select from Media Library</label>
                      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }}>
                        {mediaList.map((m: any) => {
                          const fullUrl = m.url.startsWith('http') ? m.url : `${API_BASE}${m.url}`;
                          const isSelected = form.headerMediaUrl === fullUrl;
                          return (
                            <div
                              key={m._id}
                              onClick={() => { setForm({ ...form, headerMediaUrl: fullUrl }); setHeaderMediaFile(null); }}
                              style={{
                                width: '80px', height: '80px', flexShrink: 0, borderRadius: '8px', cursor: 'pointer',
                                border: isSelected ? '3px solid #22c55e' : '1px solid #e2e8f0',
                                backgroundImage: `url(${fullUrl})`, backgroundSize: 'cover', backgroundPosition: 'center',
                                opacity: isSelected ? 1 : 0.8, transition: 'all 0.2s'
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Upload File directly to WhatsApp</label>
                    <input
                      type="file"
                      className="input-field"
                      style={{ padding: '8px' }}
                      onChange={e => { if (e.target.files?.[0]) { setHeaderMediaFile(e.target.files[0]); setForm({ ...form, headerMediaUrl: '' }); } }}
                      accept={headerComp.format === 'IMAGE' ? 'image/*' : headerComp.format === 'VIDEO' ? 'video/*' : '*/*'}
                    />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', margin: '8px 0' }}>— OR —</div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Paste Public URL</label>
                    <input
                      className="input-field"
                      value={form.headerMediaUrl}
                      onChange={e => { setForm({ ...form, headerMediaUrl: e.target.value }); if (e.target.value) setHeaderMediaFile(null); }}
                      placeholder={`https://example.com/media.${headerComp.format === 'IMAGE' ? 'jpg' : headerComp.format === 'VIDEO' ? 'mp4' : 'pdf'}`}
                    />
                  </div>
                </div>
              )}

              {/* Per-Parameter Mapping Section (Dynamic CSV Column vs Static Manual Value) */}
              {bodyVarSlots.length > 0 && (
                <div style={{ background: '#ffffff', borderRadius: '10px', padding: '14px', border: '1.5px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚙️ Map Template Body Parameters ({bodyVarSlots.length} Variables Found)</span>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '400' }}>(Assign CSV Column or Manual Value for each)</span>
                  </div>

                  {bodyVarSlots.map((varName: string, idx: number) => {
                    const key = `{{${varName}}}`;
                    const currentMode = paramModes[varName] || (audienceType === 'csv' ? 'csv' : 'static');
                    const currentValue = paramValues[varName] || '';

                    return (
                      <div key={idx} style={{ marginBottom: '12px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', fontFamily: 'monospace' }}>Variable {key}</span>
                          
                          {/* Mode Switcher Toggle */}
                          <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '2px', borderRadius: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setParamModes({ ...paramModes, [varName]: 'csv' })}
                              disabled={audienceType !== 'csv'}
                              style={{
                                padding: '4px 8px', fontSize: '11px', fontWeight: '600', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                background: currentMode === 'csv' ? 'white' : 'transparent',
                                color: currentMode === 'csv' ? '#0f172a' : '#64748b',
                              }}
                            >
                              📄 CSV Column
                            </button>
                            <button
                              type="button"
                              onClick={() => setParamModes({ ...paramModes, [varName]: 'static' })}
                              style={{
                                padding: '4px 8px', fontSize: '11px', fontWeight: '600', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                background: currentMode === 'static' ? 'white' : 'transparent',
                                color: currentMode === 'static' ? '#0f172a' : '#64748b',
                              }}
                            >
                              ✍️ Manual Value
                            </button>
                          </div>
                        </div>

                        {currentMode === 'csv' && csvParseData?.headers ? (
                          <select
                            className="input-field"
                            style={{ fontSize: '12px', padding: '6px 10px' }}
                            value={currentValue}
                            onChange={e => setParamValues({ ...paramValues, [varName]: e.target.value })}
                          >
                            <option value="">-- Select CSV Header Column for {key} --</option>
                            {csvParseData.headers.map((h: string) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="input-field"
                            style={{ fontSize: '12px', padding: '6px 10px' }}
                            placeholder={`Enter static value for ${key} (same for all recipients)`}
                            value={currentValue}
                            onChange={e => setParamValues({ ...paramValues, [varName]: e.target.value })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons Parameter Section */}
              {buttonsComp?.buttons && buttonsComp.buttons.some((b: any) => b.type === 'URL' || b.type === 'COPY_CODE') && (
                <div style={{ background: '#ffffff', borderRadius: '10px', padding: '14px', border: '1.5px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                    🔗 Action Button Variables (Assign CSV Column or Manual Value)
                  </div>
                  {buttonsComp.buttons.map((btn: any, idx: number) => {
                    if (btn.type !== 'URL' && btn.type !== 'COPY_CODE') return null;
                    const mode = buttonParamModes[idx] || (audienceType === 'csv' && csvParseData?.headers ? 'csv' : 'static');
                    const currentValue = buttonParamValues[idx] || '';

                    return (
                      <div key={idx} style={{ marginBottom: '10px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                            Button #{idx + 1} ({btn.text}): {btn.type === 'URL' ? 'Dynamic URL Suffix' : 'Coupon Code'}
                          </label>

                          {/* Toggle Mode buttons */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {audienceType === 'csv' && csvParseData?.headers && (
                              <button
                                type="button"
                                onClick={() => setButtonParamModes({ ...buttonParamModes, [idx]: 'csv' })}
                                style={{
                                  padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                                  background: mode === 'csv' ? '#166534' : '#e2e8f0',
                                  color: mode === 'csv' ? 'white' : '#475569',
                                  border: 'none',
                                }}
                              >
                                📄 CSV Column
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setButtonParamModes({ ...buttonParamModes, [idx]: 'static' })}
                              style={{
                                padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                                background: mode === 'static' ? '#2563eb' : '#e2e8f0',
                                color: mode === 'static' ? 'white' : '#475569',
                                border: 'none',
                              }}
                            >
                              ✍️ Manual Value
                            </button>
                          </div>
                        </div>

                        {mode === 'csv' && csvParseData?.headers ? (
                          <select
                            className="input-field"
                            style={{ fontSize: '12px', padding: '6px 10px' }}
                            value={currentValue}
                            onChange={e => setButtonParamValues({ ...buttonParamValues, [idx]: e.target.value })}
                          >
                            <option value="">-- Select CSV Header Column for Button #{idx + 1} --</option>
                            {csvParseData.headers.map((h: string) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="input-field"
                            style={{ fontSize: '12px', padding: '6px 10px' }}
                            placeholder={btn.type === 'URL' ? 'e.g. checkout_link or offer2026' : 'e.g. SAVE20'}
                            value={currentValue}
                            onChange={e => setButtonParamValues({ ...buttonParamValues, [idx]: e.target.value })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Dispatch & Schedule Mode Selection */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', display: 'block', marginBottom: '10px' }}>
                  🚀 Dispatch & Schedule Strategy
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setDispatchMode('immediate')}
                    style={{
                      padding: '10px 8px', borderRadius: '8px', border: '1.5px solid', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                      background: dispatchMode === 'immediate' ? '#166534' : 'white',
                      color: dispatchMode === 'immediate' ? 'white' : '#334155',
                      borderColor: dispatchMode === 'immediate' ? '#166534' : '#cbd5e1',
                    }}
                  >
                    ⚡ Immediate
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchMode('scheduled')}
                    style={{
                      padding: '10px 8px', borderRadius: '8px', border: '1.5px solid', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                      background: dispatchMode === 'scheduled' ? '#d97706' : 'white',
                      color: dispatchMode === 'scheduled' ? 'white' : '#334155',
                      borderColor: dispatchMode === 'scheduled' ? '#d97706' : '#cbd5e1',
                    }}
                  >
                    📅 Scheduled
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchMode('recurring')}
                    style={{
                      padding: '10px 8px', borderRadius: '8px', border: '1.5px solid', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                      background: dispatchMode === 'recurring' ? '#2563eb' : 'white',
                      color: dispatchMode === 'recurring' ? 'white' : '#334155',
                      borderColor: dispatchMode === 'recurring' ? '#2563eb' : '#cbd5e1',
                    }}
                  >
                    🔄 Recurring
                  </button>
                </div>

                {dispatchMode === 'scheduled' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Select Future Date & Time
                    </label>
                    <input
                      className="input-field"
                      type="datetime-local"
                      value={form.scheduledAt}
                      onChange={e => setForm({ ...form, scheduledAt: e.target.value })}
                    />
                  </div>
                )}

                {dispatchMode === 'recurring' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Select Recurrence Interval
                    </label>
                    <select
                      className="input-field"
                      value={recurringSchedule}
                      onChange={e => setRecurringSchedule(e.target.value)}
                    >
                      <option value="daily">🔄 Repeat Daily</option>
                      <option value="weekly">📅 Repeat Weekly</option>
                      <option value="monthly">🗓️ Repeat Monthly</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Estimated Cost Breakdown */}
              <div style={{ background: '#ecfdf5', borderRadius: '10px', padding: '12px 16px', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#065f46', textTransform: 'uppercase' }}>
                    💰 Estimated Campaign Cost
                  </div>
                  <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                    {totalRecipientsCount} Recipients × ₹{ratePerMsg.toFixed(2)} ({templateCategory})
                  </div>
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#065f46' }}>
                  ₹{calculatedCost}
                </div>
              </div>
            </div>

            {/* Right Column: Real-Time WhatsApp Phone Mockup */}
            <div>
              <div style={{ position: 'sticky', top: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Smartphone size={16} /> Real-Time WhatsApp Mockup
                </div>

                {/* Phone Frame Casing */}
                <div style={{
                  background: '#0b141a', borderRadius: '32px', padding: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', border: '4px solid #1e293b'
                }}>
                  {/* Phone Screen */}
                  <div style={{ background: '#0b141a', borderRadius: '22px', overflow: 'hidden', minHeight: '440px', display: 'flex', flexDirection: 'column' }}>
                    
                    {/* WhatsApp Top Header Bar */}
                    <div style={{ background: '#202c33', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#16a34a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px' }}>
                        WA
                      </div>
                      <div>
                        <div style={{ color: '#e9edef', fontSize: '13px', fontWeight: '600' }}>BlackAngler Business</div>
                        <div style={{ color: '#8696a0', fontSize: '10px' }}>Official Business Account</div>
                      </div>
                    </div>

                    {/* Chat Background Wallpaper */}
                    <div style={{ background: '#0b141a', backgroundImage: 'radial-gradient(#1f2c34 1px, transparent 1px)', backgroundSize: '12px 12px', flex: 1, padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      
                      {/* Message Bubble */}
                      <div style={{ background: '#202c33', borderRadius: '12px', padding: '10px 12px', color: '#e9edef', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', maxWidth: '92%', alignSelf: 'flex-start' }}>
                        
                        {/* Header Media / Text */}
                        {headerComp && (
                          <div style={{ marginBottom: '8px', fontWeight: '700', fontSize: '13px', color: '#e9edef' }}>
                            {headerComp.format === 'IMAGE' && (
                              previewHeaderImg ? (
                                <img
                                  key={previewHeaderImg}
                                  src={previewHeaderImg}
                                  alt="Header Media"
                                  style={{ width: '100%', borderRadius: '8px', maxHeight: '160px', objectFit: 'cover', border: '1px solid #374151', display: 'block' }}
                                />
                              ) : (
                                <div style={{
                                  width: '100%', height: '110px', borderRadius: '8px', background: '#111b21', border: '1.5px dashed #374151',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8696a0', fontSize: '11px', gap: '4px'
                                }}>
                                  <ImageIcon size={24} color="#64748b" />
                                  <span>Upload Image or Enter URL to Preview Header</span>
                                </div>
                              )
                            )}
                            {headerComp.format === 'VIDEO' && (
                              previewHeaderImg ? (
                                <video key={previewHeaderImg} src={previewHeaderImg} controls style={{ width: '100%', borderRadius: '8px', maxHeight: '160px' }} />
                              ) : (
                                <div style={{
                                  width: '100%', height: '110px', borderRadius: '8px', background: '#111b21', border: '1.5px dashed #374151',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8696a0', fontSize: '11px', gap: '4px'
                                }}>
                                  <Video size={24} color="#64748b" />
                                  <span>Upload Video or Enter URL to Preview Header</span>
                                </div>
                              )
                            )}
                            {headerComp.format === 'DOCUMENT' && (
                              <div style={{ background: '#111b21', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e9edef', fontSize: '12px' }}>
                                <FileText size={20} color="#53bdeb" />
                                <span>Document Header ({form.headerMediaUrl ? 'Attached' : 'Pending Upload'})</span>
                              </div>
                            )}
                            {headerComp.format === 'TEXT' && headerComp.text}
                          </div>
                        )}

                        {/* Body Text with Injected Parameters */}
                        <div style={{ fontSize: '13px', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                          {renderMockupBodyText()}
                        </div>

                        {/* Footer */}
                        {footerComp?.text && (
                          <div style={{ fontSize: '11px', color: '#8696a0', marginTop: '6px' }}>
                            {footerComp.text}
                          </div>
                        )}

                        <div style={{ fontSize: '10px', color: '#8696a0', textAlign: 'right', marginTop: '4px' }}>
                          15:58 ✓✓
                        </div>
                      </div>

                      {/* Interactive Buttons */}
                      {buttonsComp?.buttons && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', maxWidth: '92%' }}>
                          {buttonsComp.buttons.map((btn: any, idx: number) => (
                            <div key={idx} style={{ background: '#202c33', borderRadius: '8px', padding: '8px 12px', color: '#53bdeb', textAlign: 'center', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
                              {btn.type === 'URL' && <ExternalLink size={13} />}
                              {btn.type === 'PHONE_NUMBER' && <PhoneCall size={13} />}
                              {btn.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
          {step === 2 ? (
            <button className="btn-secondary" onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeft size={16} /> Back to Audience
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            {step === 2 && (
              <button className="btn-primary" onClick={handleSave}>
                {dispatchMode === 'immediate' ? '🚀 Launch Campaign Now' : dispatchMode === 'scheduled' ? '📅 Schedule Campaign' : '🔄 Save Recurring Campaign'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<any>(null);
  const [progressMap, setProgressMap] = useState<Record<string, any>>({});

  const segmentIdParam = searchParams?.get('segmentId');
  const segmentNameParam = searchParams?.get('segmentName');

  useEffect(() => {
    if (segmentIdParam) {
      setModal({
        audienceType: 'segment',
        segmentId: segmentIdParam,
        segmentName: segmentNameParam || '',
        name: `Campaign - ${segmentNameParam || 'Segment'}`
      });
    }
  }, [segmentIdParam, segmentNameParam]);

  const { data: broadcasts, isLoading } = useQuery({
    queryKey: ['broadcasts'],
    queryFn: () => api.get('/api/broadcasts').then(r => r.data),
  });

  // Socket.IO for real-time broadcast progress
  useEffect(() => {
    const socket = getSocket();
    socket.emit('join:broadcasts');

    const handleProgress = (data: any) => {
      setProgressMap(prev => ({ ...prev, [data.broadcastId]: data }));
      if (data.status && data.status !== 'sending') {
        queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      }
    };

    socket.on('broadcast:progress', handleProgress);

    return () => {
      socket.off('broadcast:progress', handleProgress);
      socket.emit('leave:broadcasts');
    };
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/api/broadcasts', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); setModal(null); toast.success('Campaign created!'); },
  });

  const updateMutation = useMutation({
    mutationFn: (d: any) => api.put(`/api/broadcasts/${d._id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); setModal(null); toast.success('Campaign updated!'); },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/broadcasts/${id}/send`),
    onSuccess: (_, id) => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); toast.success('Broadcast started!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to send'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/broadcasts/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); toast.success('Deleted'); },
  });

  const handleDayClick = (date: Date) => {
    const tableEl = document.getElementById('broadcasts-table');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Broadcast Campaigns</h1>
            <p className="page-subtitle">Send promotional messages to your customers</p>
          </div>
          <button className="btn-primary" onClick={() => setModal('new')}>
            <Plus size={16} />
            New Campaign
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>
        {/* Broadcast Calendar */}
        {!isLoading && broadcasts?.length > 0 && (
          <BroadcastCalendar
            broadcasts={broadcasts}
            onDayClick={(bId: string) => router.push(`/broadcasts/${bId}`)}
            onNewCampaignOnDate={(dateStr?: string) => setModal('new')}
          />
        )}

        {/* Info banner */}
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ color: '#B45309', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong style={{ fontSize: '13px', color: '#92400E' }}>Meta Template Requirement & Frequency Capping</strong>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#B45309' }}>
              Meta enforces a 24-hour marketing limit per user. Click on any campaign to view recipient breakdown, Meta diagnostics, or retry frequency-capped recipients.
            </p>
          </div>
        </div>

        <div id="broadcasts-table" className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Template</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Stats</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={7}><div className="skeleton" style={{ height: '14px' }} /></td></tr>
                ))
              ) : !broadcasts?.length ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
                    <Megaphone size={36} style={{ color: '#d1d5db', marginBottom: '8px' }} />
                    <div>No campaigns yet. Create your first broadcast!</div>
                  </td>
                </tr>
              ) : (
                broadcasts.map((b: any) => {
                  const sc = STATUS_MAP[b.status as keyof typeof STATUS_MAP] || STATUS_MAP.draft;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={b._id}>
                      <td>
                        <button
                          onClick={() => router.push(`/broadcasts/${b._id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: '600', fontSize: '14px', color: '#1B5E37', textDecoration: 'underline' }}>
                            {b.name}
                          </div>
                        </button>
                      </td>
                      <td><code style={{ fontSize: '12px', background: '#f3f4f6', padding: '3px 8px', borderRadius: '6px' }}>{b.templateName}</code></td>
                      <td>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {b.audienceTags?.length > 0 ? b.audienceTags.join(', ') : 'All Customers'}
                        </div>
                      </td>
                      <td>
                        <span className={sc.class} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <StatusIcon size={12} />
                          {sc.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {(() => {
                            const progress = progressMap[b._id];
                            const isSending = b.status === 'sending' || progress?.status === 'sending';
                            const sent = progress?.sent ?? b.stats?.sent ?? 0;
                            const failed = progress?.failed ?? b.stats?.failed ?? 0;
                            const total = progress?.total ?? b.stats?.total ?? 0;
                            const pct = total > 0 ? Math.round((sent + failed) / total * 100) : 0;

                            if (isSending && total > 0) {
                              return (
                                <div style={{ minWidth: '140px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', fontWeight: '600' }}>
                                    <span style={{ color: '#1B5E37' }}>{sent} sent</span>
                                    <span style={{ color: '#6b7280' }}>{pct}%</span>
                                  </div>
                                  <div style={{ width: '100%', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${pct}%`,
                                      height: '100%',
                                      background: 'linear-gradient(90deg, #1B5E37, #22C55E)',
                                      borderRadius: '3px',
                                      transition: 'width 0.5s ease',
                                    }} />
                                  </div>
                                  {failed > 0 && (
                                    <div style={{ fontSize: '10px', color: '#EF4444', marginTop: '2px' }}>{failed} failed</div>
                                  )}
                                </div>
                              );
                            }

                            return total > 0 ? (
                              <><CheckCircle2 size={12} style={{ color: '#22C55E', display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{sent} / {total}</>
                            ) : '—';
                          })()}
                        </div>
                      </td>
                      <td style={{ color: '#6b7280', fontSize: '12px' }}>
                        {format(new Date(b.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => router.push(`/broadcasts/${b._id}`)}
                            title="View Analytics & Recipients"
                          >
                            <Eye size={12} />
                            Details
                          </button>
                          {b.status === 'draft' && (
                            <>
                              <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setModal(b)}>
                                <Edit2 size={12} />
                              </button>
                              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => { if (confirm(`Send to ${b.audienceTags?.join(', ') || 'all customers'}? This will send WhatsApp messages.`)) sendMutation.mutate(b._id); }}>
                                <Send size={12} />
                                Send
                              </button>
                            </>
                          )}
                          <button className="btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(b._id); }}>
                            <Trash2 size={12} />
                          </button>
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

      {modal && (
        <BroadcastModal 
          broadcast={modal === 'new' ? null : modal} 
          onClose={() => setModal(null)} 
          onSave={(form: any) => {
            if (form._id) {
              updateMutation.mutate(form);
            } else {
              createMutation.mutate({ ...form, status: 'draft' });
            }
          }} 
        />
      )}
    </div>
  );
}
