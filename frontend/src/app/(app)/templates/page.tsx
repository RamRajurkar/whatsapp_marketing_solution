'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Image as ImageIcon, Loader2, Smile, Search, Filter, FileText, MessageSquare, Video, FileDown, LayoutGrid, MousePointerClick, Globe, Tag, ChevronDown, X, Eye } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import './templates.css';

interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  cards?: any[];
}

interface Template {
  name: string;
  language: string;
  status: string;
  category: string;
  components?: TemplateComponent[];
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  APPROVED: { label: 'Approved', className: 'tpl-status-approved' },
  PENDING: { label: 'Pending', className: 'tpl-status-pending' },
  REJECTED: { label: 'Rejected', className: 'tpl-status-rejected' },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  MARKETING: <Tag size={13} />,
  UTILITY: <FileText size={13} />,
  AUTHENTICATION: <Globe size={13} />,
};

function getComponentIcon(type: string, format?: string) {
  if (type === 'HEADER') {
    if (format === 'IMAGE') return <ImageIcon size={14} />;
    if (format === 'VIDEO') return <Video size={14} />;
    if (format === 'DOCUMENT') return <FileDown size={14} />;
    return <FileText size={14} />;
  }
  if (type === 'BODY') return <MessageSquare size={14} />;
  if (type === 'BUTTONS') return <MousePointerClick size={14} />;
  if (type === 'CAROUSEL') return <LayoutGrid size={14} />;
  return <FileText size={14} />;
}

function getBodyText(components?: TemplateComponent[]): string {
  if (!components) return '';
  const body = components.find(c => c.type === 'BODY');
  return body?.text || '';
}

function getHeaderFormat(components?: TemplateComponent[]): string | null {
  if (!components) return null;
  const header = components.find(c => c.type === 'HEADER');
  return header?.format || null;
}

function getButtons(components?: TemplateComponent[]): { type: string; text: string }[] {
  if (!components) return [];
  const btns = components.find(c => c.type === 'BUTTONS');
  return btns?.buttons || [];
}

function getFooterText(components?: TemplateComponent[]): string {
  if (!components) return '';
  const footer = components.find(c => c.type === 'FOOTER');
  return footer?.text || '';
}

function formatTemplateName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getLangFlag(lang: string): string {
  const map: Record<string, string> = {
    'en_US': '🇺🇸', 'en_GB': '🇬🇧', 'en': '🇺🇸', 'hi': '🇮🇳',
    'es': '🇪🇸', 'pt_BR': '🇧🇷', 'ar': '🇸🇦', 'fr': '🇫🇷',
    'de': '🇩🇪', 'it': '🇮🇹', 'ja': '🇯🇵', 'ko': '🇰🇷',
  };
  return map[lang] || '🌐';
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('en_US');
  const [bodyText, setBodyText] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get('/api/messaging/templates');
      setTemplates(data.templates || []);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesSearch = !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [templates, searchQuery, statusFilter, categoryFilter]);

  const stats = useMemo(() => ({
    total: templates.length,
    approved: templates.filter(t => t.status === 'APPROVED').length,
    pending: templates.filter(t => t.status === 'PENDING').length,
    rejected: templates.filter(t => t.status === 'REJECTED').length,
  }), [templates]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !bodyText) {
      toast.error('Name and body text are required');
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    formData.append('language', language);
    formData.append('bodyText', bodyText);
    if (file) {
      formData.append('file', file);
    }

    try {
      await api.post('/api/messaging/templates', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Template submitted to Meta for approval!');
      setIsCreating(false);
      setName('');
      setBodyText('');
      setFile(null);
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create template');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="tpl-loading">
        <Loader2 className="tpl-loading-spinner" />
        <span>Loading templates...</span>
      </div>
    );
  }

  return (
    <div className="tpl-page">
      {/* Header */}
      <div className="tpl-header">
        <div>
          <h1 className="tpl-title">Message Templates</h1>
          <p className="tpl-subtitle">Manage your WhatsApp message templates</p>
        </div>
        <button onClick={() => setIsCreating(!isCreating)} className="tpl-create-btn">
          <Plus size={16} />
          Create Template
        </button>
      </div>

      {/* Stats Strip */}
      <div className="tpl-stats-strip">
        <div className="tpl-stat-item" onClick={() => setStatusFilter('ALL')}>
          <span className="tpl-stat-number">{stats.total}</span>
          <span className="tpl-stat-label">Total</span>
        </div>
        <div className="tpl-stat-divider" />
        <div className="tpl-stat-item" onClick={() => setStatusFilter('APPROVED')}>
          <span className="tpl-stat-number tpl-stat-green">{stats.approved}</span>
          <span className="tpl-stat-label">Approved</span>
        </div>
        <div className="tpl-stat-divider" />
        <div className="tpl-stat-item" onClick={() => setStatusFilter('PENDING')}>
          <span className="tpl-stat-number tpl-stat-yellow">{stats.pending}</span>
          <span className="tpl-stat-label">Pending</span>
        </div>
        <div className="tpl-stat-divider" />
        <div className="tpl-stat-item" onClick={() => setStatusFilter('REJECTED')}>
          <span className="tpl-stat-number tpl-stat-red">{stats.rejected}</span>
          <span className="tpl-stat-label">Rejected</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="tpl-toolbar">
        <div className="tpl-search-wrap">
          <Search size={16} className="tpl-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="tpl-search-input"
          />
          {searchQuery && (
            <button className="tpl-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="tpl-filters">
          <div className="tpl-select-wrap">
            <Filter size={14} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="tpl-select">
              <option value="ALL">All Status</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <ChevronDown size={14} className="tpl-select-arrow" />
          </div>
          <div className="tpl-select-wrap">
            <Tag size={14} />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="tpl-select">
              <option value="ALL">All Categories</option>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
            <ChevronDown size={14} className="tpl-select-arrow" />
          </div>
        </div>
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="tpl-create-panel">
          <div className="tpl-create-panel-header">
            <h2>Create New Template</h2>
            <button onClick={() => setIsCreating(false)} className="tpl-close-btn"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="tpl-form">
            <div className="tpl-form-grid">
              <div className="tpl-form-field">
                <label>Template Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. summer_sale_2024"
                  required
                />
              </div>
              <div className="tpl-form-field">
                <label>Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                </select>
              </div>
              <div className="tpl-form-field">
                <label>Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="en_US">English (US)</option>
                  <option value="en_GB">English (UK)</option>
                  <option value="hi">Hindi</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
              <div className="tpl-form-field">
                <label>Header Image (Optional)</label>
                <div className="tpl-file-input">
                  <input type="file" accept="image/jpeg,image/png" onChange={handleFileChange} className="tpl-file-hidden" id="template-image" />
                  <label htmlFor="template-image" className="tpl-file-label">
                    <ImageIcon size={16} />
                    <span>{file ? file.name : 'Upload JPEG or PNG'}</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="tpl-form-field">
              <div className="tpl-form-field-header">
                <label>Message Body</label>
                <div className="tpl-emoji-wrap">
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="tpl-emoji-btn">
                    <Smile size={16} />
                  </button>
                  {showEmojiPicker && (
                    <div className="tpl-emoji-picker">
                      <EmojiPicker onEmojiClick={(e) => { setBodyText(prev => prev + e.emoji); setShowEmojiPicker(false); }} />
                    </div>
                  )}
                </div>
              </div>
              <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Enter your message text..." rows={4} required />
            </div>
            <div className="tpl-form-actions">
              <button type="button" onClick={() => setIsCreating(false)} className="tpl-cancel-btn">Cancel</button>
              <button type="submit" disabled={submitting} className="tpl-submit-btn">
                {submitting && <Loader2 size={16} className="tpl-spin" />}
                Submit to Meta
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Template Cards Grid */}
      <div className="tpl-grid">
        {filteredTemplates.map((template, i) => {
          const bodyPreview = getBodyText(template.components);
          const headerFormat = getHeaderFormat(template.components);
          const buttons = getButtons(template.components);
          const footer = getFooterText(template.components);
          const statusCfg = STATUS_CONFIG[template.status] || STATUS_CONFIG.PENDING;

          return (
            <div key={i} className="tpl-card" onClick={() => setPreviewTemplate(template)}>
              {/* Card Header */}
              <div className="tpl-card-top">
                <div className="tpl-card-icon-wrap">
                  {headerFormat === 'IMAGE' ? <ImageIcon size={18} /> :
                   headerFormat === 'VIDEO' ? <Video size={18} /> :
                   headerFormat === 'DOCUMENT' ? <FileDown size={18} /> :
                   headerFormat === 'TEXT' ? <FileText size={18} /> :
                   <MessageSquare size={18} />}
                </div>
                <span className={`tpl-status-badge ${statusCfg.className}`}>
                  {statusCfg.label}
                </span>
              </div>

              {/* Card Body */}
              <h3 className="tpl-card-name">{formatTemplateName(template.name)}</h3>

              {bodyPreview && (
                <p className="tpl-card-preview">{bodyPreview}</p>
              )}

              {/* Component Tags */}
              <div className="tpl-card-tags">
                {template.components?.map((comp, j) => (
                  <span key={j} className="tpl-card-tag">
                    {getComponentIcon(comp.type, comp.format)}
                    {comp.type === 'HEADER' && comp.format ? comp.format : comp.type}
                  </span>
                ))}
              </div>

              {/* Buttons Preview */}
              {buttons.length > 0 && (
                <div className="tpl-card-buttons">
                  {buttons.slice(0, 3).map((btn, j) => (
                    <span key={j} className="tpl-card-button-chip">{btn.text}</span>
                  ))}
                </div>
              )}

              {/* Card Footer */}
              <div className="tpl-card-footer">
                <div className="tpl-card-meta">
                  <span className="tpl-card-lang">
                    {getLangFlag(template.language)} {template.language}
                  </span>
                  <span className="tpl-card-category">
                    {CATEGORY_ICONS[template.category]}
                    {template.category}
                  </span>
                </div>
                <button className="tpl-card-preview-btn" onClick={(e) => { e.stopPropagation(); setPreviewTemplate(template); }}>
                  <Eye size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {filteredTemplates.length === 0 && !loading && (
          <div className="tpl-empty">
            <MessageSquare size={40} strokeWidth={1} />
            <h3>No templates found</h3>
            <p>{searchQuery || statusFilter !== 'ALL' ? 'Try adjusting your filters' : 'Create your first template to get started'}</p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="tpl-modal-overlay" onClick={() => setPreviewTemplate(null)}>
          <div className="tpl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tpl-modal-header">
              <h3>Template Preview</h3>
              <button onClick={() => setPreviewTemplate(null)} className="tpl-close-btn"><X size={18} /></button>
            </div>
            <div className="tpl-modal-body">
              {/* WhatsApp-style chat bubble preview */}
              <div className="tpl-wa-preview">
                <div className="tpl-wa-bubble">
                  {getHeaderFormat(previewTemplate.components) && (
                    <div className="tpl-wa-header-placeholder">
                      {getHeaderFormat(previewTemplate.components) === 'IMAGE' && <ImageIcon size={24} />}
                      {getHeaderFormat(previewTemplate.components) === 'VIDEO' && <Video size={24} />}
                      {getHeaderFormat(previewTemplate.components) === 'DOCUMENT' && <FileDown size={24} />}
                      <span>{getHeaderFormat(previewTemplate.components)} Header</span>
                    </div>
                  )}
                  {getBodyText(previewTemplate.components) && (
                    <p className="tpl-wa-body">{getBodyText(previewTemplate.components)}</p>
                  )}
                  {getFooterText(previewTemplate.components) && (
                    <p className="tpl-wa-footer">{getFooterText(previewTemplate.components)}</p>
                  )}
                  {getButtons(previewTemplate.components).length > 0 && (
                    <div className="tpl-wa-buttons">
                      {getButtons(previewTemplate.components).map((btn, j) => (
                        <button key={j} className="tpl-wa-btn">{btn.text}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Template info */}
              <div className="tpl-modal-info">
                <div className="tpl-modal-info-row">
                  <span className="tpl-modal-info-label">Name</span>
                  <span className="tpl-modal-info-value">{previewTemplate.name}</span>
                </div>
                <div className="tpl-modal-info-row">
                  <span className="tpl-modal-info-label">Status</span>
                  <span className={`tpl-status-badge ${(STATUS_CONFIG[previewTemplate.status] || STATUS_CONFIG.PENDING).className}`}>
                    {(STATUS_CONFIG[previewTemplate.status] || STATUS_CONFIG.PENDING).label}
                  </span>
                </div>
                <div className="tpl-modal-info-row">
                  <span className="tpl-modal-info-label">Category</span>
                  <span className="tpl-modal-info-value">{previewTemplate.category}</span>
                </div>
                <div className="tpl-modal-info-row">
                  <span className="tpl-modal-info-label">Language</span>
                  <span className="tpl-modal-info-value">{getLangFlag(previewTemplate.language)} {previewTemplate.language}</span>
                </div>
                <div className="tpl-modal-info-row">
                  <span className="tpl-modal-info-label">Components</span>
                  <div className="tpl-modal-components">
                    {previewTemplate.components?.map((comp, j) => (
                      <span key={j} className="tpl-card-tag">
                        {getComponentIcon(comp.type, comp.format)}
                        {comp.type}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
