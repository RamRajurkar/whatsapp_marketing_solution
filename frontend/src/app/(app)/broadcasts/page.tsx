'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, getDay } from 'date-fns';
import {
  Megaphone, FileText, Clock, Send, CheckCircle2, XCircle,
  AlertTriangle, Trash2, Plus, Edit2, Loader2, Calendar, ChevronLeft, ChevronRight, X, Image as ImageIcon, Upload,
  Pause, Play, RefreshCw, Download, Search, Filter, CheckCheck, AlertCircle, Eye, Check,
  DollarSign, Zap, Repeat, ArrowRight, ArrowLeft, Users, Smartphone, ExternalLink, PhoneCall
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

function BroadcastCalendar({ broadcasts, onDayClick }: { broadcasts: any[]; onDayClick: (date: Date) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart); // 0=Sun

  const broadcastsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    broadcasts?.forEach((b: any) => {
      const dateKey = b.scheduledAt
        ? format(new Date(b.scheduledAt), 'yyyy-MM-dd')
        : format(new Date(b.createdAt), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(b);
    });
    return map;
  }, [broadcasts]);

  return (
    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Calendar size={20} style={{ color: '#1B5E37' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1a1a2e' }}>Broadcast Calendar</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ChevronLeft size={18} color="#374151" />
          </button>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e', minWidth: '140px', textAlign: 'center' }}>
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ChevronRight size={18} color="#374151" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: '600', color: '#9ca3af', padding: '6px 0' }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {/* Padding for start of month */}
        {Array(startPadding).fill(null).map((_, i) => (
          <div key={`pad-${i}`} style={{ minHeight: '60px' }} />
        ))}

        {daysInMonth.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayBroadcasts = broadcastsByDate[dateKey] || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateKey}
              onClick={() => dayBroadcasts.length > 0 && onDayClick(day)}
              style={{
                minHeight: '60px',
                padding: '4px',
                borderRadius: '8px',
                border: isToday ? '2px solid #1B5E37' : '1px solid #f3f4f6',
                background: isToday ? '#f0fdf4' : dayBroadcasts.length > 0 ? '#fafafa' : 'transparent',
                cursor: dayBroadcasts.length > 0 ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                fontSize: '12px',
                fontWeight: isToday ? '700' : '500',
                color: isToday ? '#1B5E37' : '#374151',
                marginBottom: '2px',
              }}>
                {format(day, 'd')}
              </div>
              {dayBroadcasts.slice(0, 2).map((b: any) => {
                const sc = STATUS_MAP[b.status as keyof typeof STATUS_MAP] || STATUS_MAP.draft;
                return (
                  <div key={b._id} style={{
                    fontSize: '9px',
                    fontWeight: '600',
                    color: 'white',
                    background: sc.color,
                    borderRadius: '4px',
                    padding: '1px 4px',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {b.name}
                  </div>
                );
              })}
              {dayBroadcasts.length > 2 && (
                <div style={{ fontSize: '9px', color: '#6b7280', fontWeight: '600' }}>+{dayBroadcasts.length - 2} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BroadcastModal({ broadcast, onClose, onSave }: any) {
  const [step, setStep] = useState<1 | 2>(1);
  const [audienceType, setAudienceType] = useState<'tags' | 'csv'>(broadcast?.audienceType || 'tags');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParseData, setCsvParseData] = useState<any>(null);
  const [csvParsing, setCsvParsing] = useState(false);

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
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/broadcasts/parse-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
                    flex: 1, padding: '10px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    background: audienceType === 'tags' ? 'white' : 'transparent',
                    color: audienceType === 'tags' ? '#0f172a' : '#64748b',
                    boxShadow: audienceType === 'tags' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  🏷️ Filter by Audience Tags
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceType('csv')}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    background: audienceType === 'csv' ? 'white' : 'transparent',
                    color: audienceType === 'csv' ? '#0f172a' : '#64748b',
                    boxShadow: audienceType === 'csv' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  📄 Upload CSV Contact List
                </button>
              </div>
            </div>

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

                {!csvParseData ? (
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

                {/* Full Scrollable & Inline Editable Contacts Table */}
                {csvParseData?.parsed_recipients && (
                  <div style={{ marginTop: '16px', background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                          📋 Verified Contact List ({csvParseData.parsed_recipients.length} Total Contacts)
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                          ✏️ You can edit names or numbers directly inline before starting the campaign
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: '12px', fontWeight: '700' }}>
                        {csvParseData.parsed_recipients.length} Valid WhatsApp Contacts
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
                          {csvParseData.parsed_recipients.map((row: any, i: number) => (
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
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<any>(null);
  const [progressMap, setProgressMap] = useState<Record<string, any>>({});

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
          <BroadcastCalendar broadcasts={broadcasts} onDayClick={handleDayClick} />
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
