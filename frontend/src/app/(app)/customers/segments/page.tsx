'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Users,
  FolderPlus,
  Upload,
  Filter,
  Search,
  Trash2,
  Download,
  Megaphone,
  Eye,
  X,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Plus,
  Loader2,
  UserPlus
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function CustomerSegmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'all' | 'segments'>('segments');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<'all' | 'csv_upload' | 'crm_filter'>('all');
  
  // Modals & Drawers state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'csv' | 'crm'>('csv');
  const [viewSegment, setViewSegment] = useState<any | null>(null);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerPage, setDrawerPage] = useState(1);

  // Form State: CSV Upload Mode
  const [csvName, setCsvName] = useState('');
  const [csvDescription, setCsvDescription] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [syncToCrm, setSyncToCrm] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Form State: CRM Filter & Select Mode
  const [crmName, setCrmName] = useState('');
  const [crmDescription, setCrmDescription] = useState('');
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [crmSearchText, setCrmSearchText] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  // Fetch Segments
  const { data: segmentsData, isLoading: isLoadingSegments } = useQuery({
    queryKey: ['customer-segments'],
    queryFn: async () => {
      const res = await api.get('/api/segments');
      return res.data.segments || [];
    },
  });

  // Fetch CRM Customers for Create Modal (CRM Filter Mode)
  const { data: crmCustomersData, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers-for-segments', crmSearchText],
    queryFn: async () => {
      const res = await api.get(`/api/customers?search=${encodeURIComponent(crmSearchText)}&limit=200`);
      return res.data.customers || [];
    },
    enabled: showCreateModal && createMode === 'crm',
  });

  // Fetch Selected Segment Members for Slide-over Drawer
  const { data: segmentDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['segment-details', viewSegment?._id, drawerSearch, drawerPage],
    queryFn: async () => {
      if (!viewSegment?._id) return null;
      const res = await api.get(`/api/segments/${viewSegment._id}?search=${encodeURIComponent(drawerSearch)}&page=${drawerPage}&limit=50`);
      return res.data;
    },
    enabled: !!viewSegment?._id,
  });

  // Delete Segment Mutation
  const deleteMutation = useMutation({
    mutationFn: (segmentId: string) => api.delete(`/api/segments/${segmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-segments'] });
      toast.success('Segment deleted successfully');
      if (viewSegment) setViewSegment(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete segment'),
  });

  // Extract all unique tags from customers for CRM filter dropdown
  const availableTags = useMemo(() => {
    if (!crmCustomersData) return [];
    const tagSet = new Set<string>();
    crmCustomersData.forEach((c: any) => {
      (c.tags || []).forEach((t: string) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [crmCustomersData]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalSegments = segmentsData?.length || 0;
    let csvCount = 0;
    let crmCount = 0;
    let totalAudience = 0;

    (segmentsData || []).forEach((s: any) => {
      if (s.source === 'csv_upload') csvCount++;
      else crmCount++;
      totalAudience += (s.totalCount || 0);
    });

    return { totalSegments, csvCount, crmCount, totalAudience };
  }, [segmentsData]);

  // Filtered Segments
  const filteredSegments = useMemo(() => {
    return (segmentsData || []).filter((s: any) => {
      if (selectedSourceFilter !== 'all' && s.source !== selectedSourceFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (s.name || '').toLowerCase().includes(q);
        const descMatch = (s.description || '').toLowerCase().includes(q);
        const tagMatch = (s.tags || []).some((t: string) => t.toLowerCase().includes(q));
        if (!nameMatch && !descMatch && !tagMatch) return false;
      }
      return true;
    });
  }, [segmentsData, selectedSourceFilter, searchQuery]);

  // Handle CSV Upload Form Submit
  const handleCreateFromCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvName.trim()) return toast.error('Please enter a segment name');
    if (!csvFile) return toast.error('Please select a CSV file to upload');

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', csvName.trim());
      formData.append('description', csvDescription.trim());
      formData.append('sync_to_crm', String(syncToCrm));
      formData.append('file', csvFile);

      const res = await api.post('/api/segments/from-csv', formData);

      toast.success(res.data.message || 'Segment created successfully!');
      queryClient.invalidateQueries({ queryKey: ['customer-segments'] });
      setShowCreateModal(false);
      // Reset form
      setCsvName('');
      setCsvDescription('');
      setCsvFile(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload CSV segment');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle CRM Filter Form Submit
  const handleCreateFromCrm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmName.trim()) return toast.error('Please enter a segment name');

    setIsUploading(true);
    try {
      const payload = {
        name: crmName.trim(),
        description: crmDescription.trim(),
        filterTags: selectedTagFilters,
        customerIds: selectedCustomerIds,
        searchQuery: crmSearchText,
      };

      const res = await api.post('/api/segments/from-crm', payload);

      toast.success(res.data.message || 'Segment created successfully!');
      queryClient.invalidateQueries({ queryKey: ['customer-segments'] });
      setShowCreateModal(false);
      // Reset form
      setCrmName('');
      setCrmDescription('');
      setSelectedTagFilters([]);
      setSelectedCustomerIds([]);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create segment');
    } finally {
      setIsUploading(false);
    }
  };

  // Export Segment CSV
  const handleExportCsv = (segmentId: string, segmentName: string) => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/segments/${segmentId}/export`, '_blank');
  };

  return (
    <div>
      {/* ── Page Header & Top Tabs ── */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className="page-title">Customer Audience Segments</h1>
            <p className="page-subtitle">Group, target, and organize contacts for high-converting WhatsApp marketing campaigns</p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '700' }}
            >
              <Plus size={16} />
              Create Segment
            </button>
          </div>
        </div>

        {/* Tab Navigation Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '2px' }}>
          <Link
            href="/customers"
            style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: '600', textDecoration: 'none',
              color: '#64748b', borderBottom: '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Users size={15} /> All Customers CRM
          </Link>
          <button
            onClick={() => setActiveTab('segments')}
            style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer',
              color: '#1B5E37', borderBottom: '2px solid #1B5E37', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Layers size={15} /> Targeted Audience Segments
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* ── KPI Summary Ribbon ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#dcfce7', color: '#15803d', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
              <Layers size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Total Segments</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{metrics.totalSegments}</div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#dbeafe', color: '#1d4ed8', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>CSV Upload Segments</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{metrics.csvCount}</div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#fef3c7', color: '#b45309', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
              <Filter size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>CRM Filtered Segments</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{metrics.crmCount}</div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#f3e8ff', color: '#7e22ce', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
              <Users size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Total Targeted Audience</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{metrics.totalAudience.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* ── Search & Filter Controls ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search segments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: '34px', paddingRight: '14px', paddingTop: '8px', paddingBottom: '8px',
                  borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '13px', width: '240px'
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <select
                value={selectedSourceFilter}
                onChange={e => setSelectedSourceFilter(e.target.value as any)}
                style={{
                  paddingLeft: '12px', paddingRight: '28px', paddingTop: '8px', paddingBottom: '8px',
                  borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '13px', fontWeight: '600', color: '#334155', cursor: 'pointer'
                }}
              >
                <option value="all">All Segment Types</option>
                <option value="csv_upload">📄 CSV File Uploads</option>
                <option value="crm_filter">👥 CRM Filtered</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Segment Grid ── */}
        {isLoadingSegments ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <div>Loading customer segments...</div>
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <Layers size={48} style={{ color: '#cbd5e1', margin: '0 auto 14px' }} />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>No Customer Segments Found</h3>
            <p style={{ margin: '6px 0 20px', fontSize: '13px' }}>Create audience segments by uploading customer CSV files or filtering your CRM database.</p>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Create Your First Segment
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {filteredSegments.map((segment: any) => {
              const isCsv = segment.source === 'csv_upload';
              const createdDateStr = new Date(segment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

              return (
                <div
                  key={segment._id}
                  className="glass-card"
                  style={{
                    padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    border: '1px solid #e2e8f0', transition: 'all 0.2s ease', position: 'relative'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#1B5E37'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  <div>
                    {/* Header: Source Badge & Date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px',
                        background: isCsv ? '#dbeafe' : '#dcfce7',
                        color: isCsv ? '#1e40af' : '#15803d',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}>
                        {isCsv ? <FileSpreadsheet size={11} /> : <Filter size={11} />}
                        {isCsv ? 'CSV Upload' : 'CRM Selection'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{createdDateStr}</span>
                    </div>

                    {/* Segment Title & Description */}
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                      {segment.name}
                    </h3>
                    <p style={{ margin: '4px 0 14px', fontSize: '12px', color: '#64748b', minHeight: '34px', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {segment.description || 'No description provided'}
                    </p>

                    {/* Metric pill */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Segment Reach</span>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: '#1B5E37' }}>
                        {(segment.totalCount || 0).toLocaleString()} contacts
                      </span>
                    </div>

                    {/* Associated Tag Badges */}
                    {segment.tags && segment.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' }}>
                        {segment.tags.slice(0, 3).map((tag: string, i: number) => (
                          <span key={i} style={{ fontSize: '10px', fontWeight: '600', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px' }}>
                            #{tag}
                          </span>
                        ))}
                        {segment.tags.length > 3 && (
                          <span style={{ fontSize: '10px', color: '#94a3b8', padding: '2px 4px' }}>
                            +{segment.tags.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        title="View Members"
                        onClick={() => { setViewSegment(segment); setDrawerPage(1); }}
                        style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', color: '#334155', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={14} /> Members
                      </button>

                      <button
                        title="Export CSV"
                        onClick={() => handleExportCsv(segment._id, segment.name)}
                        style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', color: '#334155', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Download size={14} /> Export
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        title="Delete Segment"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete segment "${segment.name}"?`)) {
                            deleteMutation.mutate(segment._id);
                          }
                        }}
                        style={{ background: 'none', border: 'none', padding: '6px', color: '#ef4444', cursor: 'pointer' }}
                      >
                        <Trash2 size={15} />
                      </button>

                      <Link
                        href={`/broadcasts?segmentId=${segment._id}&segmentName=${encodeURIComponent(segment.name)}`}
                        className="btn-primary"
                        style={{ padding: '5px 10px', fontSize: '11px', fontWeight: '700', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Megaphone size={12} /> Broadcast
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL: CREATE CUSTOMER SEGMENT ── */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }} onClick={() => setShowCreateModal(false)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', padding: '24px' }}>
            
            {/* Modal Title & Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>Create Customer Segment</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Target specific groups for marketing & engagement</span>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {/* Creation Method Tabs */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setCreateMode('csv')}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: 'none', cursor: 'pointer',
                  background: createMode === 'csv' ? '#ffffff' : 'transparent',
                  color: createMode === 'csv' ? '#1B5E37' : '#64748b',
                  boxShadow: createMode === 'csv' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <FileSpreadsheet size={15} /> Upload CSV File
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('crm')}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: 'none', cursor: 'pointer',
                  background: createMode === 'crm' ? '#ffffff' : 'transparent',
                  color: createMode === 'crm' ? '#1B5E37' : '#64748b',
                  boxShadow: createMode === 'crm' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Users size={15} /> Select from CRM Customers
              </button>
            </div>

            {/* TAB 1: CSV FILE UPLOAD MODE */}
            {createMode === 'csv' && (
              <form onSubmit={handleCreateFromCsv} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>Segment Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Festive Sale VIP Leads"
                    value={csvName}
                    onChange={e => setCsvName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="Brief details about this audience..."
                    value={csvDescription}
                    onChange={e => setCsvDescription(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                {/* CSV File Dropzone */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>Upload Customer CSV File *</label>
                  <div
                    style={{
                      border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '20px', textAlign: 'center',
                      background: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onClick={() => document.getElementById('segment-csv-input')?.click()}
                  >
                    <Upload size={28} style={{ color: '#64748b', margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                      {csvFile ? csvFile.name : 'Click to browse CSV file'}
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
                      Supports columns: Name, Phone, Tags
                    </span>
                    <input
                      id="segment-csv-input"
                      type="file"
                      accept=".csv"
                      style={{ display: 'none' }}
                      onChange={e => {
                        if (e.target.files?.[0]) setCsvFile(e.target.files[0]);
                      }}
                    />
                  </div>
                </div>

                {/* Sync to CRM Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <input
                    type="checkbox"
                    id="syncToCrmToggle"
                    checked={syncToCrm}
                    onChange={e => setSyncToCrm(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#1B5E37', cursor: 'pointer' }}
                  />
                  <label htmlFor="syncToCrmToggle" style={{ fontSize: '12px', color: '#334155', fontWeight: '600', cursor: 'pointer' }}>
                    Auto-sync new contacts from CSV into main Customer CRM directory
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={isUploading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                    Create Segment
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: CRM FILTER & SELECTION MODE */}
            {createMode === 'crm' && (
              <form onSubmit={handleCreateFromCrm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>Segment Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Wholesale Buyers Segment"
                    value={crmName}
                    onChange={e => setCrmName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="Details about these customers..."
                    value={crmDescription}
                    onChange={e => setCrmDescription(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                {/* Filter by Tags */}
                {availableTags.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>Filter by Customer Tags</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '90px', overflowY: 'auto', padding: '6px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      {availableTags.map((tag: string) => {
                        const isSelected = selectedTagFilters.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSelectedTagFilters(prev => isSelected ? prev.filter(t => t !== tag) : [...prev, tag]);
                            }}
                            style={{
                              fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                              background: isSelected ? '#1B5E37' : '#e2e8f0',
                              color: isSelected ? 'white' : '#475569'
                            }}
                          >
                            #{tag} {isSelected && '✓'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Search & Select Table */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>Select Specific Customers ({selectedCustomerIds.length} selected)</label>
                    <input
                      type="text"
                      placeholder="Search name/phone..."
                      value={crmSearchText}
                      onChange={e => setCrmSearchText(e.target.value)}
                      style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '160px' }}
                    />
                  </div>

                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#ffffff' }}>
                    {isLoadingCustomers ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>Loading CRM contacts...</div>
                    ) : !crmCustomersData || crmCustomersData.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>No customers found in CRM</div>
                    ) : (
                      crmCustomersData.map((c: any) => {
                        const isChecked = selectedCustomerIds.includes(c._id);
                        return (
                          <div
                            key={c._id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px',
                              borderBottom: '1px solid #f1f5f9', background: isChecked ? '#f0fdf4' : 'transparent', cursor: 'pointer'
                            }}
                            onClick={() => {
                              setSelectedCustomerIds(prev => isChecked ? prev.filter(id => id !== c._id) : [...prev, c._id]);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                style={{ width: '14px', height: '14px', accentColor: '#1B5E37' }}
                              />
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{c.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{c.phone}</div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '4px' }}>
                              {(c.tags || []).slice(0, 2).map((t: string, i: number) => (
                                <span key={i} style={{ fontSize: '9px', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{t}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={isUploading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                    Create Segment
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── SLIDE-OVER DRAWER: VIEW SEGMENT MEMBERS ── */}
      {viewSegment && (
        <div className="modal-overlay" style={{ zIndex: 99999 }} onClick={() => setViewSegment(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', right: 0, top: 0, bottom: 0, width: '460px', maxWidth: '90vw',
              height: '100vh', background: '#ffffff', boxShadow: '-10px 0 30px rgba(0,0,0,0.2)',
              padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.25s ease-out'
            }}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{viewSegment.name}</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {(segmentDetails?.totalMembers || viewSegment.totalCount || 0).toLocaleString()} contacts in segment
                </span>
              </div>
              <button onClick={() => setViewSegment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {/* Member Search Bar */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search member name or phone..."
                value={drawerSearch}
                onChange={e => { setDrawerSearch(e.target.value); setDrawerPage(1); }}
                style={{ width: '100%', paddingLeft: '30px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
            </div>

            {/* Member List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isLoadingDetails ? (
                <div style={{ padding: '30px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading members...
                </div>
              ) : !segmentDetails?.members || segmentDetails.members.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>No members found</div>
              ) : (
                segmentDetails.members.map((m: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px 14px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{m.name || 'Customer'}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{m.phone}</div>
                    </div>
                    {m.tags && m.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {m.tags.slice(0, 2).map((t: string, i: number) => (
                          <span key={i} style={{ fontSize: '9px', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: '4px' }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Drawer Actions */}
            <div style={{ paddingTop: '16px', borderTop: '1px solid #e2e8f0', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="btn-secondary"
                style={{ padding: '8px 14px', fontSize: '12px' }}
                onClick={() => handleExportCsv(viewSegment._id, viewSegment.name)}
              >
                <Download size={14} /> Export CSV
              </button>

              <Link
                href={`/broadcasts?segmentId=${viewSegment._id}&segmentName=${encodeURIComponent(viewSegment.name)}`}
                className="btn-primary"
                style={{ padding: '8px 14px', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Megaphone size={14} /> Launch Broadcast
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
