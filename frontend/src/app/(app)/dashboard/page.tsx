'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { format } from 'date-fns';
import {
  Users,
  UserPlus,
  MessageSquare,
  CalendarDays,
  TrendingUp,
  ArrowUpRight,
  Clock,
  Megaphone,
  Send,
  Plus,
  Download,
  Activity,
  CheckCircle2,
  AlertCircle,
  Timer,
  UtensilsCrossed,
  Zap,
  BarChart3,
} from 'lucide-react';

interface DashboardStats {
  totalCustomers: number;
  newCustomersToday: number;
  activeConversations: number;
  reservationsToday: number;
  recentConversations: any[];
}

function StatCard({ icon: Icon, label, value, color, subtitle }: any) {
  return (
    <div className="stat-card" style={{ 
      animation: 'fadeIn 0.4s ease forwards',
      border: `1.5px solid ${color}40`,
      borderTop: `4px solid ${color}`,
      boxShadow: `0 8px 24px ${color}15`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#6b7280', fontSize: '13px', fontWeight: '600', margin: '0 0 10px' }}>{label}</p>
          <h3 style={{ fontSize: '34px', fontWeight: '800', margin: 0, color: '#1a1a2e', letterSpacing: '-1px', lineHeight: 1 }}>{value}</h3>
          {subtitle && (
            <div className="stat-trend" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '10px', fontSize: '12px', color: color, fontWeight: '600' }}>
              <TrendingUp size={14} />
              <span>{subtitle}</span>
            </div>
          )}
        </div>
        <div className="stat-icon-wrap" style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${color}30`,
        }}>
          {Icon && <Icon size={22} style={{ color: color }} />}
        </div>
      </div>
    </div>
  );
}

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/reports/dashboard').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get('/api/reports/analytics?days=7').then(r => r.data),
    refetchInterval: 60000,
  });

  const chartData = analytics?.dailyMessages?.map((d: any, i: number) => ({
    day: DAYS_OF_WEEK[new Date(d._id).getDay()],
    total: d.count,
    inbound: d.inbound,
    outbound: d.outbound,
  })) || [];

  // Pie chart for project progress-like widget
  const totalMessages = analytics?.totals?.messages || 0;
  const totalReservations = analytics?.totals?.reservations || 0;
  const totalBroadcasts = analytics?.totals?.broadcasts?.sent || 0;
  const totalSum = totalMessages + totalReservations + totalBroadcasts || 1;
  const pieData = [
    { name: 'Messages', value: totalMessages, color: '#1B5E37' },
    { name: 'Reservations', value: totalReservations, color: '#2E7D4F' },
    { name: 'Broadcasts', value: totalBroadcasts, color: '#93C5A4' },
  ];
  const completionPct = totalMessages > 0 ? Math.round((totalReservations / (totalMessages || 1)) * 100) : 0;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Plan, prioritize, and manage your restaurant with ease.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <a href="/broadcasts">
              <button className="btn-primary">
                <Plus size={16} />
                New Campaign
              </button>
            </a>
            <a href="/reports">
              <button className="btn-secondary">
                <Download size={16} />
                View Reports
              </button>
            </a>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '130px', borderRadius: '16px' }} />
            ))
          ) : (
            <>
              <StatCard
                icon={Users}
                label="Total Customers"
                value={stats?.totalCustomers || 0}
                color="#1B5E37"
                subtitle="Increased from last month"
              />
              <StatCard
                icon={UserPlus}
                label="New Today"
                value={stats?.newCustomersToday || 0}
                color="#3B82F6"
                subtitle="Increased from last month"
              />
              <StatCard
                icon={MessageSquare}
                label="Active Chats"
                value={stats?.activeConversations || 0}
                color="#F59E0B"
                subtitle="Increased from last month"
              />
              <StatCard
                icon={CalendarDays}
                label="Reservations Today"
                value={stats?.reservationsToday || 0}
                color="#8B5CF6"
                subtitle="On track"
              />
            </>
          )}
        </div>

        {/* Main Dashboard Grid */}
        <div className="dashboard-grid">
          {/* Analytics Chart - spans 2 columns */}
          <div className="dashboard-widget" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="dashboard-widget-title" style={{ margin: 0 }}>
                <Activity size={20} className="widget-icon" style={{ color: '#1B5E37' }} />
                Message Analytics
              </h3>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 13, fill: '#9ca3af', fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="inbound" name="Received" fill="#1B5E37" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="outbound" name="Sent" fill="#93C5A4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '14px', flexDirection: 'column', gap: '8px' }}>
                <MessageSquare size={32} style={{ color: '#d1d5db' }} />
                <span>No message data yet. Start chatting!</span>
              </div>
            )}
          </div>

          {/* Right Column — Project/Tasks list */}
          <div className="dashboard-widget" style={{ gridRow: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 className="dashboard-widget-title" style={{ margin: 0 }}>
                <Activity size={20} className="widget-icon" style={{ color: '#1B5E37' }} />
                Quick Actions
              </h3>
              <a href="/customers" className="widget-action-btn" style={{ textDecoration: 'none' }}>
                <Plus size={12} />
                New
              </a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {[
                { icon: Send, label: 'Send Broadcast', desc: 'Message all customers', href: '/broadcasts', color: '#1B5E37' },
                { icon: CalendarDays, label: 'New Reservation', desc: 'Book a table', href: '/reservations', color: '#F59E0B' },
                { icon: Users, label: 'Add Customer', desc: 'Create new contact', href: '/customers', color: '#3B82F6' },
                { icon: UtensilsCrossed, label: 'Update Menu', desc: 'Upload menu files', href: '/menu', color: '#8B5CF6' },
                { icon: Zap, label: 'Quick Replies', desc: 'Manage templates', href: '/quick-replies', color: '#EF4444' },
              ].map((action, idx) => (
                <a key={idx} href={action.href} style={{ textDecoration: 'none' }}>
                  <div className="activity-item" style={{ cursor: 'pointer', borderRadius: '10px', padding: '10px', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="activity-icon" style={{ background: `${action.color}10`, color: action.color }}>
                      <action.icon size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: '#1a1a2e' }}>{action.label}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{action.desc}</div>
                    </div>
                    <ArrowUpRight size={14} style={{ color: '#d1d5db' }} />
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Recent Conversations */}
          <div className="dashboard-widget">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="dashboard-widget-title" style={{ margin: 0 }}>
                <Clock size={20} className="widget-icon" style={{ color: '#1B5E37' }} />
                Recent Conversations
              </h3>
            </div>
            <div>
              {stats?.recentConversations?.length ? (
                stats.recentConversations.slice(0, 4).map((conv: any) => (
                  <a key={conv._id} href={`/inbox?id=${conv._id}`} style={{ textDecoration: 'none' }}>
                    <div className="activity-item" style={{ cursor: 'pointer', borderRadius: '10px', padding: '8px', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div className="avatar" style={{
                        width: '36px', height: '36px', fontSize: '14px',
                        background: `hsl(${(conv.customerName?.charCodeAt(0) || 65) * 7 % 360}, 45%, 88%)`,
                        color: `hsl(${(conv.customerName?.charCodeAt(0) || 65) * 7 % 360}, 45%, 30%)`,
                      }}>
                        {conv.customerName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: '#1a1a2e' }}>{conv.customerName}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {conv.lastMessage || 'No messages yet'}
                        </div>
                      </div>
                      {conv.unreadCount > 0 && (
                        <div className="unread-badge">{conv.unreadCount}</div>
                      )}
                    </div>
                  </a>
                ))
              ) : (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', paddingTop: '24px', paddingBottom: '24px' }}>
                  <MessageSquare size={28} style={{ color: '#d1d5db', marginBottom: '8px' }} />
                  <div>No recent conversations</div>
                </div>
              )}
            </div>
            <a href="/inbox" style={{
              display: 'block', textAlign: 'center', fontSize: '13px', fontWeight: '600',
              color: '#1B5E37', textDecoration: 'none', marginTop: '12px', padding: '8px',
              borderRadius: '8px', transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#E8F5E9'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              View All Conversations
            </a>
          </div>

          {/* Activity Breakdown */}
          <div className="dashboard-widget">
            <h3 className="dashboard-widget-title">
              <BarChart3 size={20} className="widget-icon" style={{ color: '#1B5E37' }} />
              Activity Breakdown
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ width: '140px', height: '140px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e', lineHeight: 1 }}>
                    {totalMessages + totalReservations + totalBroadcasts}
                  </div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: '500' }}>Total</div>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {pieData.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: '#6b7280', flex: 1 }}>{item.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a2e' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '24px' }}>
          <div className="dashboard-widget" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TrendingUp size={22} style={{ color: '#1B5E37' }} />
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a2e', letterSpacing: '-0.5px' }}>
                {analytics?.totals?.messages || 0}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Total Messages</div>
            </div>
          </div>
          <div className="dashboard-widget" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CalendarDays size={22} style={{ color: '#B45309' }} />
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a2e', letterSpacing: '-0.5px' }}>
                {analytics?.totals?.reservations || 0}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Total Reservations</div>
            </div>
          </div>
          <div className="dashboard-widget" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Megaphone size={22} style={{ color: '#6D28D9' }} />
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a2e', letterSpacing: '-0.5px' }}>
                {analytics?.totals?.broadcasts?.sent || 0}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Broadcasts Sent</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
