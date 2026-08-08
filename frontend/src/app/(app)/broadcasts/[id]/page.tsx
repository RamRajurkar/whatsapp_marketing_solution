'use client';

import { useState, use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  ArrowLeft, RefreshCw, Pause, Play, Download, Search, CheckCheck,
  Check, AlertCircle, XCircle, Loader2, FileText, Clock, AlertTriangle, Users, Send
} from 'lucide-react';

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

function CheckCircle2({ size = 16, style }: { size?: number; style?: any }) {
  return <CheckCheck size={size} style={style} />;
}

interface FriendlyError {
  title: string;
  explanation: string;
  solution: string;
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
}

function formatMetaErrorForUser(code?: number | string, rawReason?: string): FriendlyError {
  const errCode = Number(code) || 0;
  const reasonStr = (rawReason || '').toLowerCase();

  // 1. Sandbox Test Phone Number Not Allowed List Error
  if (reasonStr.includes('not in allowed list') || reasonStr.includes('recipient list')) {
    return {
      title: '📱 Phone Number Not in Meta Test List',
      explanation: 'In Meta Sandbox Test Mode, messages can only be sent to phone numbers added in Meta Developer Dashboard.',
      solution: '💡 Fix: Add this phone number to your Meta App Test Numbers list (Meta Portal → WhatsApp → API Setup), or switch Meta App to Live Mode.',
      badgeColor: '#b45309',
      badgeBg: '#fffbeb',
      badgeBorder: '#fde68a',
    };
  }

  // 2. Media Upload / Download Error
  if (errCode === 131053 || reasonStr.includes('media upload error') || reasonStr.includes('download media')) {
    return {
      title: '🖼️ Image/Video Link Unreachable',
      explanation: 'WhatsApp could not download the image header from localhost or a private network link.',
      solution: '💡 Fix: Upload the image file directly from your computer or pick from Media Library gallery when creating campaign.',
      badgeColor: '#dc2626',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca',
    };
  }

  // 3. Missing Template Variable / Button Parameter Error
  if (reasonStr.includes('parameter count mismatch') || reasonStr.includes('required parameter') || reasonStr.includes('parameter_name')) {
    return {
      title: '📝 Template Variable/Button Info Missing',
      explanation: 'One of the body variables or dynamic button fields (e.g. coupon code or URL) was left empty.',
      solution: '💡 Fix: Enter values for all variable fields or assign CSV header columns during Step 2 setup.',
      badgeColor: '#b45309',
      badgeBg: '#fffbeb',
      badgeBorder: '#fde68a',
    };
  }

  // 4. Header Format Mismatch (Text/Image/Video/Doc)
  if (errCode === 132012 || errCode === 132000 || errCode === 132001 || reasonStr.includes('format mismatch')) {
    return {
      title: '🖼️ Header Media Required',
      explanation: 'This approved template requires an image or document header, but no file was attached.',
      solution: '💡 Fix: Upload an image file or choose one from Media Library during campaign creation.',
      badgeColor: '#dc2626',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca',
    };
  }

  // 5. Unregistered / Invalid WhatsApp Number
  if (errCode === 131047 || reasonStr.includes('unregistered') || reasonStr.includes('invalid number')) {
    return {
      title: '📱 Invalid WhatsApp Number',
      explanation: 'This phone number is not registered on WhatsApp.',
      solution: '💡 Fix: Double-check the recipient phone number or remove it from your contact list.',
      badgeColor: '#dc2626',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca',
    };
  }

  // 6. Recipient Opted Out
  if (errCode === 131026 || reasonStr.includes('opted out') || reasonStr.includes('user opt-out')) {
    return {
      title: '🚫 Customer Opted Out',
      explanation: 'This customer has opted out of promotional marketing messages on WhatsApp.',
      solution: '💡 Info: No action needed — WhatsApp automatically blocks messages to opted-out contacts.',
      badgeColor: '#64748b',
      badgeBg: '#f8fafc',
      badgeBorder: '#e2e8f0',
    };
  }

  // 7. 24h Frequency Capping
  if (errCode === 131049 || reasonStr.includes('frequency cap')) {
    return {
      title: '⏳ WhatsApp 24h Daily Limit Reached',
      explanation: 'WhatsApp temporarily paused marketing messages for this contact for 24 hours to prevent spam.',
      solution: '💡 Info: System will automatically retry sending message after 24 hours.',
      badgeColor: '#c2410c',
      badgeBg: '#fff7ed',
      badgeBorder: '#ffedd5',
    };
  }

  // 8. Meta Access Token Expired
  if (errCode === 190 || errCode === 100 || reasonStr.includes('token') || reasonStr.includes('access token')) {
    return {
      title: '🔑 Meta API Access Token Expired',
      explanation: 'Your Meta Graph API Access Token is invalid or has expired.',
      solution: '💡 Fix: Go to Settings → WhatsApp API and paste a fresh Permanent System User Access Token.',
      badgeColor: '#dc2626',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca',
    };
  }

  // 9. Server Rate Limits / Traffic
  if (errCode === 130429 || reasonStr.includes('rate limit') || reasonStr.includes('throughput')) {
    return {
      title: '🚦 WhatsApp Server Traffic High',
      explanation: 'WhatsApp Cloud API servers are experiencing heavy traffic volume.',
      solution: '💡 Info: System will automatically retry sending shortly.',
      badgeColor: '#c2410c',
      badgeBg: '#fff7ed',
      badgeBorder: '#ffedd5',
    };
  }

  // 10. Fallback formatting clean Meta text
  const cleanReason = rawReason ? rawReason.replace(/^\[#\d+\]\s*/, '').replace(/^\(#\d+\)\s*/, '') : 'Message delivery failed';
  return {
    title: `⚠️ ${cleanReason}`,
    explanation: cleanReason,
    solution: '💡 Fix: Check recipient phone number or review template parameter setup.',
    badgeColor: '#c2410c',
    badgeBg: '#fff7ed',
    badgeBorder: '#ffedd5',
  };
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const broadcastId = resolvedParams.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retryMode, setRetryMode] = useState('temporary_only');
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({});

  // Fetch broadcast details & aggregate analytics
  const { data: detailsData, isLoading: detailsLoading } = useQuery({
    queryKey: ['broadcast-details', broadcastId],
    queryFn: async () => (await api.get(`/api/broadcasts/${broadcastId}/details`)).data,
    refetchInterval: 4000,
  });

  // Fetch paginated recipients with search & status filter
  const { data: recipientsData, isLoading: recipientsLoading } = useQuery({
    queryKey: ['broadcast-recipients', broadcastId, page, statusFilter, searchQuery],
    queryFn: async () => {
      const p = new URLSearchParams({
        page: String(page),
        limit: '50',
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery }),
      });
      return (await api.get(`/api/broadcasts/${broadcastId}/recipients?${p}`)).data;
    },
    refetchInterval: 4000,
  });

  // Retry failed recipients mutation
  const retryMutation = useMutation({
    mutationFn: async (mode: string) => {
      return (await api.post(`/api/broadcasts/${broadcastId}/retry`, { retry_mode: mode })).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Retry triggered successfully');
      setShowRetryConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['broadcast-details', broadcastId] });
      queryClient.invalidateQueries({ queryKey: ['broadcast-recipients', broadcastId] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to trigger retry');
    },
  });

  // Pause campaign mutation
  const pauseCampaignMutation = useMutation({
    mutationFn: async () => (await api.post(`/api/broadcasts/${broadcastId}/pause`)).data,
    onSuccess: () => {
      toast.success('Campaign paused');
      queryClient.invalidateQueries({ queryKey: ['broadcast-details', broadcastId] });
    },
  });

  // Resume campaign mutation
  const resumeCampaignMutation = useMutation({
    mutationFn: async () => (await api.post(`/api/broadcasts/${broadcastId}/resume`)).data,
    onSuccess: () => {
      toast.success('Campaign resumed');
      queryClient.invalidateQueries({ queryKey: ['broadcast-details', broadcastId] });
    },
  });

  // Per-recipient pause / resume mutation
  const toggleRecipientPauseMutation = useMutation({
    mutationFn: async ({ recId, isPaused }: { recId: string; isPaused: boolean }) => {
      const action = isPaused ? 'resume' : 'pause';
      return (await api.post(`/api/broadcasts/${broadcastId}/recipients/${recId}/${action}`)).data;
    },
    onSuccess: () => {
      toast.success('Recipient retry status updated');
      queryClient.invalidateQueries({ queryKey: ['broadcast-recipients', broadcastId] });
    },
  });

  const broadcast = detailsData?.broadcast;
  const analytics = detailsData?.analytics || {};
  const isPaused = broadcast?.isPaused || broadcast?.status === 'paused';

  const exportCSV = () => {
    toast.loading('Generating full recipient CSV export...', { id: 'csv-export' });
    api.get(`/api/broadcasts/${broadcastId}/export-recipients-csv`, {
      params: { status: statusFilter },
      responseType: 'blob',
    }).then(response => {
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `campaign_${broadcastId}_all_recipients.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded full recipient CSV file!', { id: 'csv-export' });
    }).catch(err => {
      toast.error('Failed to export recipients CSV', { id: 'csv-export' });
    });
  };

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Top Breadcrumbs & Back Nav */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => router.push('/broadcasts')}
          style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#374151'
          }}
        >
          <ArrowLeft size={16} /> Back to Broadcasts
        </button>
        <span style={{ color: '#9ca3af', fontSize: '13px' }}>/</span>
        <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Campaign Details</span>
      </div>

      {detailsLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px', color: '#1B5E37' }} />
          <div style={{ fontSize: '15px', fontWeight: '600' }}>Loading Campaign Analytics...</div>
        </div>
      ) : !broadcast ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#ef4444' }}>
          <XCircle size={36} style={{ margin: '0 auto 12px' }} />
          <h3>Campaign Not Found</h3>
          <button className="btn-primary" onClick={() => router.push('/broadcasts')}>Back to Broadcasts</button>
        </div>
      ) : (
        <>
          {/* Header Banner */}
          <div className="glass-card" style={{ padding: '24px', borderRadius: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#0f172a' }}>{broadcast.name}</h1>
                <span className={`badge ${STATUS_MAP[broadcast.status as keyof typeof STATUS_MAP]?.class || 'badge-draft'}`} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                  {STATUS_MAP[broadcast.status as keyof typeof STATUS_MAP]?.label || broadcast.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#64748b', flexWrap: 'wrap', marginTop: '6px' }}>
                <div>Template: <code style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', color: '#0f172a', fontWeight: '600' }}>{broadcast.templateName}</code> ({broadcast.templateLanguage || 'en'})</div>
                <div>Audience: <strong style={{ color: '#334155' }}>{broadcast.audienceTags?.length > 0 ? broadcast.audienceTags.join(', ') : 'All Customers'}</strong></div>
                <div>Created: <strong>{format(new Date(broadcast.createdAt), 'MMM d, yyyy HH:mm')}</strong></div>
              </div>
            </div>

            {/* Action Bar Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {isPaused ? (
                <button
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', borderColor: '#22c55e', color: '#166534', background: '#f0fdf4', padding: '8px 16px', fontWeight: '600' }}
                  onClick={() => resumeCampaignMutation.mutate()}
                  disabled={resumeCampaignMutation.isPending}
                >
                  <Play size={15} /> Resume Campaign
                </button>
              ) : (
                <button
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', borderColor: '#f59e0b', color: '#92400e', background: '#fffbeb', padding: '8px 16px', fontWeight: '600' }}
                  onClick={() => pauseCampaignMutation.mutate()}
                  disabled={pauseCampaignMutation.isPending}
                >
                  <Pause size={15} /> Pause Campaign
                </button>
              )}

              <button
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', background: '#1B5E37', padding: '8px 18px', fontWeight: '600' }}
                onClick={() => setShowRetryConfirm(true)}
              >
                <RefreshCw size={15} /> Retry Failed ({analytics.frequencyCapped + analytics.failedTemporary || 0})
              </button>

              <button
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 16px', fontWeight: '600' }}
                onClick={exportCSV}
              >
                <Download size={15} /> Export CSV
              </button>
            </div>
          </div>

          {/* Full Width KPI Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Targeted</span>
                <Users size={18} color="#64748b" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a' }}>{(analytics.total || 0).toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600', marginTop: '4px' }}>
                {analytics.totalProcessed ? `${analytics.totalProcessed.toLocaleString()} processed so far` : 'Recipients in campaign'}
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sent (Pending)</span>
                <Send size={18} color="#64748b" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#334155' }}>{(analytics.sent || 0).toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500', marginTop: '4px' }}>Dispatched, pending delivery</div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #bbf7d0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#166534', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivered (Unread)</span>
                <Check size={18} color="#16a34a" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#15803d' }}>{(analytics.delivered || 0).toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600', marginTop: '4px' }}>Delivered to phone</div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #bfdbfe', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Read Receipts</span>
                <CheckCheck size={18} color="#2563eb" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#1d4ed8' }}>{(analytics.read || 0).toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: '600', marginTop: '4px' }}>Read by customer</div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #fde68a', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#b45309', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Temp Failures (#429)</span>
                <AlertTriangle size={18} color="#d97706" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#d97706' }}>{(analytics.failedTemporary || 0).toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px' }}>Daily portfolio cap / rate limit</div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #ffedd5', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#c2410c', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meta 24h Cap (#131049)</span>
                <AlertCircle size={18} color="#ea580c" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#ea580c' }}>{(analytics.frequencyCapped || 0).toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#c2410c', marginTop: '4px' }}>Auto-reschedules after 24h</div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #fecaca', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Permanent Failures</span>
                <XCircle size={18} color="#dc2626" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#dc2626' }}>{(analytics.failedPermanent || 0).toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '4px' }}>Invalid number or opt-out</div>
            </div>
          </div>

          {/* Complete Campaign Progress & Delivery Funnel Visualizer */}
          {analytics.total > 0 && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>
                  📊 Overall Campaign Execution & Funnel Progress ({(analytics.totalProcessed || 0).toLocaleString()} of {(analytics.total || 0).toLocaleString()} Processed)
                </div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#16a34a', background: '#dcfce7', padding: '3px 10px', borderRadius: '12px' }}>
                  {(((analytics.totalProcessed || 0) / (analytics.total || 1)) * 100).toFixed(1)}% Completed
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Multi-segment Progress Bar */}
                <div style={{ width: '100%', height: '14px', background: '#f1f5f9', borderRadius: '7px', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${(analytics.read / (analytics.total || 1)) * 100}%`, background: '#3b82f6', height: '100%' }} title={`Read: ${analytics.read}`} />
                  <div style={{ width: `${(analytics.delivered / (analytics.total || 1)) * 100}%`, background: '#22c55e', height: '100%' }} title={`Delivered: ${analytics.delivered}`} />
                  <div style={{ width: `${(analytics.sent / (analytics.total || 1)) * 100}%`, background: '#94a3b8', height: '100%' }} title={`Sent Pending: ${analytics.sent}`} />
                  <div style={{ width: `${(analytics.failedTemporary / (analytics.total || 1)) * 100}%`, background: '#f59e0b', height: '100%' }} title={`Temp Failures / Tier Limit: ${analytics.failedTemporary}`} />
                  <div style={{ width: `${(analytics.failedPermanent / (analytics.total || 1)) * 100}%`, background: '#ef4444', height: '100%' }} title={`Permanent Failures: ${analytics.failedPermanent}`} />
                </div>

                {/* Segment Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '11px', fontWeight: '600', color: '#475569', marginTop: '4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%' }} />
                    Read ({analytics.read})
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%' }} />
                    Delivered ({analytics.delivered})
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', background: '#94a3b8', borderRadius: '50%' }} />
                    Sent Pending ({analytics.sent})
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', background: '#f59e0b', borderRadius: '50%' }} />
                    Temp Tier Limit #429 ({(analytics.failedTemporary || 0).toLocaleString()})
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }} />
                    Permanent Failed ({(analytics.failedPermanent || 0).toLocaleString()})
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                    <span style={{ width: '8px', height: '8px', background: '#e2e8f0', borderRadius: '50%' }} />
                    Remaining Queued ({Math.max(0, (analytics.total || 0) - (analytics.totalProcessed || 0)).toLocaleString()})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Recipient Diagnostics Section */}
          <div className="glass-card" style={{ borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Recipient Delivery Diagnostics</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Inspect real-time message status, Meta error codes, and control individual retries</p>
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  className="input-field"
                  placeholder="Search recipient name or phone..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                  style={{ paddingLeft: '38px', fontSize: '13px' }}
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              {[
                { id: 'all', label: 'All Recipients' },
                { id: 'delivered', label: 'Delivered' },
                { id: 'read', label: 'Read' },
                { id: 'frequency_capped', label: 'Freq Capped (#131049)' },
                { id: 'failed_temporary', label: 'Temp Failures' },
                { id: 'failed_permanent', label: 'Permanent Failures' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setStatusFilter(tab.id); setPage(1); }}
                  style={{
                    padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none',
                    background: statusFilter === tab.id ? '#1B5E37' : '#f1f5f9',
                    color: statusFilter === tab.id ? 'white' : '#475569',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Recipient Table */}
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '12px 16px' }}>Recipient</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Meta Diagnostics & Error Reason</th>
                    <th style={{ padding: '12px 16px' }}>Last Attempt</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px' }}>Retry Control</th>
                  </tr>
                </thead>
                <tbody>
                  {recipientsLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i}><td colSpan={5} style={{ padding: '16px' }}><div className="skeleton" style={{ height: '16px' }} /></td></tr>
                    ))
                  ) : !recipientsData?.recipients?.length ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                        <AlertCircle size={28} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                        <div>No recipients found matching current criteria.</div>
                      </td>
                    </tr>
                  ) : (
                    recipientsData.recipients.map((r: any) => (
                      <tr key={r._id}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{r.customerName}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{r.customerPhone}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {r.status === 'read' ? (
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCheck size={13} color="#2563eb" /> Read
                            </span>
                          ) : r.status === 'delivered' ? (
                            <span style={{ background: '#f0fdf4', color: '#15803d', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Check size={13} color="#16a34a" /> Delivered
                            </span>
                          ) : r.status === 'frequency_capped' ? (
                            <span style={{ background: '#fff7ed', color: '#c2410c', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertCircle size={13} color="#ea580c" /> Freq Capped (24h)
                            </span>
                          ) : r.status === 'failed' ? (
                            <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <XCircle size={13} color="#dc2626" /> {r.isRetryable ? 'Temp Failed' : 'Perm Failed'}
                            </span>
                          ) : (
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '600' }}>
                              {r.status || 'Sent'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {r.errorReason ? (() => {
                            const errInfo = formatMetaErrorForUser(r.errorCode, r.errorReason);
                            const isExpanded = !!expandedErrors[r._id];
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: isExpanded ? '540px' : '440px', transition: 'all 0.2s' }}>
                                {/* Direct Raw Meta Error & Code Bar */}
                                <div style={{
                                  display: 'flex', alignItems: isExpanded ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '8px',
                                  background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1'
                                }}>
                                  <div style={{
                                    fontSize: '11px', fontFamily: 'monospace', color: '#1e293b', fontWeight: '600',
                                    whiteSpace: isExpanded ? 'normal' : 'nowrap',
                                    wordBreak: isExpanded ? 'break-word' : 'normal',
                                    overflow: isExpanded ? 'visible' : 'hidden',
                                    textOverflow: isExpanded ? 'clip' : 'ellipsis',
                                  }}>
                                    {r.errorCode ? (
                                      <span style={{ background: '#fee2e2', color: '#dc2626', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', marginRight: '6px', display: 'inline-block' }}>
                                        Code #{r.errorCode}
                                      </span>
                                    ) : null}
                                    <span>{r.errorReason}</span>
                                  </div>

                                  {/* Describe / Explain Button */}
                                  <button
                                    type="button"
                                    onClick={() => setExpandedErrors(prev => ({ ...prev, [r._id]: !prev[r._id] }))}
                                    style={{
                                      flexShrink: 0, padding: '3px 8px', fontSize: '11px', fontWeight: '700',
                                      background: isExpanded ? '#dbeafe' : '#f1f5f9',
                                      color: isExpanded ? '#1d4ed8' : '#334155',
                                      border: isExpanded ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                                      borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                  >
                                    {isExpanded ? '▲ Hide' : '💡 Describe / Explain'}
                                  </button>
                                </div>

                                {/* Collapsible Translated Explanation & Solution Card */}
                                {isExpanded && (
                                  <div style={{
                                    fontSize: '12px',
                                    color: errInfo.badgeColor,
                                    background: errInfo.badgeBg,
                                    border: `1px solid ${errInfo.badgeBorder}`,
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                  }}>
                                    <div style={{ fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', wordBreak: 'break-word' }}>
                                      <span>{errInfo.title}</span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', lineHeight: '1.4', opacity: 0.95, wordBreak: 'break-word' }}>
                                      {errInfo.explanation}
                                    </div>
                                    <div style={{ fontSize: '11.5px', fontWeight: '600', color: '#047857', marginTop: '2px', wordBreak: 'break-word' }}>
                                      {errInfo.solution}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })() : (
                            <span style={{ color: '#cbd5e1', fontSize: '13px' }}>—</span>
                          )}
                        </td>
                        <td style={{ color: '#64748b', fontSize: '12px', padding: '12px 16px' }}>
                          {r.lastAttemptAt ? format(new Date(r.lastAttemptAt), 'MMM d, HH:mm') : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '12px 16px' }}>
                          <button
                            onClick={() => toggleRecipientPauseMutation.mutate({ recId: r._id, isPaused: !!r.isPaused })}
                            style={{
                              border: '1px solid #cbd5e1', background: r.isPaused ? '#fffbeb' : '#ffffff', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: r.isPaused ? '#b45309' : '#334155', fontWeight: '500'
                            }}
                          >
                            {r.isPaused ? '▶️ Resume Retry' : '⏸️ Pause Retry'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {recipientsData && recipientsData.total > 50 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  Showing {(page - 1) * 50 + 1} to {Math.min(page * 50, recipientsData.total)} of {recipientsData.total} recipients
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    Previous
                  </button>
                  <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} disabled={!recipientsData.has_more} onClick={() => setPage(p => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Smart Retry Modal Dialog */}
          {showRetryConfirm && (
            <div className="modal-overlay" style={{ zIndex: 99999 }}>
              <div className="modal-content glass-card" style={{ maxWidth: '520px', padding: '24px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                  Retry Campaign Failures
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', marginBottom: '20px' }}>
                  Select the recipient category you want to re-attempt sending to:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <input
                      type="radio"
                      name="retryMode"
                      value="temporary_only"
                      checked={retryMode === 'temporary_only'}
                      onChange={() => setRetryMode('temporary_only')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Temporary & Frequency-Capped Only (Recommended)</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Retries Meta 24h cap (#131049), rate limits, and network timeouts ({analytics.frequencyCapped + analytics.failedTemporary || 0} recipients)</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <input
                      type="radio"
                      name="retryMode"
                      value="frequency_capped"
                      checked={retryMode === 'frequency_capped'}
                      onChange={() => setRetryMode('frequency_capped')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Only Meta 24h Frequency-Capped (#131049)</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Retries only recipients who hit the 24-hour Meta marketing limit ({analytics.frequencyCapped || 0} recipients)</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <input
                      type="radio"
                      name="retryMode"
                      value="all_failed"
                      checked={retryMode === 'all_failed'}
                      onChange={() => setRetryMode('all_failed')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>All Failed Recipients</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Retries all failed records including invalid numbers</div>
                    </div>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button className="btn-secondary" onClick={() => setShowRetryConfirm(false)}>Cancel</button>
                  <button
                    className="btn-primary"
                    style={{ background: '#1B5E37', padding: '8px 20px' }}
                    onClick={() => retryMutation.mutate(retryMode)}
                    disabled={retryMutation.isPending}
                  >
                    {retryMutation.isPending ? 'Starting Retry...' : 'Start Retry'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
