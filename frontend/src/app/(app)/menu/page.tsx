'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Upload, Loader2, UtensilsCrossed, FileText, Image, Eye, Trash2, FolderOpen, CheckCircle2, AlertCircle } from 'lucide-react';

export default function MenuPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { data: assets, isLoading } = useQuery({ queryKey: ['menu'], queryFn: () => api.get('/api/menu').then(r => r.data) });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/api/menu/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menu'] }); toast.success('Deleted'); } });

  const handleUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Unsupported file type. Please upload PDF, JPEG, PNG, or WebP files.');
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 16MB.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/api/menu/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Menu uploaded successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const getFileIcon = (asset: any) => {
    if (asset.type === 'image') {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      return <img src={`${backendUrl}${asset.url}`} alt={asset.name} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />;
    }
    return (
      <div style={{ height: '160px', background: 'linear-gradient(135deg, #FEE2E2, #FECACA)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
        <FileText size={40} style={{ color: '#B91C1C' }} />
        <span style={{ fontSize: '12px', color: '#B91C1C', fontWeight: '600' }}>PDF Document</span>
      </div>
    );
  };

  const getViewUrl = (asset: any) => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${backendUrl}${asset.url}`;
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Menu Management</h1>
            <p className="page-subtitle">Upload and manage your restaurant menu files</p>
          </div>
          {assets?.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#E8F5E9', borderRadius: '10px' }}>
              <CheckCircle2 size={16} style={{ color: '#1B5E37' }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1B5E37' }}>{assets.length} file{assets.length > 1 ? 's' : ''} uploaded</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '0 32px' }}>
        {/* Upload Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#1B5E37' : '#e5e7eb'}`,
            borderRadius: '20px',
            padding: '48px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(27,94,55,0.04)' : 'white',
            transition: 'all 0.2s',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
          />
          {uploading ? (
            <div>
              <Loader2 size={40} style={{ color: '#1B5E37', marginBottom: '12px', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#1B5E37', fontWeight: '600', fontSize: '16px', margin: 0 }}>Uploading...</p>
            </div>
          ) : (
            <>
              <Upload size={44} style={{ color: '#1B5E37', marginBottom: '16px' }} />
              <h3 style={{ margin: '0 0 8px', color: '#1a1a2e', fontSize: '18px', fontWeight: '700' }}>Upload Menu Files</h3>
              <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '14px' }}>Drag & drop or click to upload PDF menus or menu images</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <span className="tag-pill" style={{ background: '#FEE2E2', color: '#B91C1C' }}><FileText size={12} /> PDF</span>
                <span className="tag-pill" style={{ background: '#DBEAFE', color: '#1D4ED8' }}><Image size={12} /> JPEG/PNG</span>
                <span className="tag-pill" style={{ background: '#f3f4f6', color: '#6b7280' }}>Max 16MB</span>
              </div>
              <p style={{ margin: '16px 0 0', color: '#9ca3af', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                <AlertCircle size={12} /> Files are stored locally on this machine
              </p>
            </>
          )}
        </div>

        {/* File Grid */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: '200px', borderRadius: '16px' }} />)}
          </div>
        ) : !assets?.length ? (
          <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
            <UtensilsCrossed size={36} style={{ color: '#d1d5db', marginBottom: '12px' }} />
            <p>No menu files uploaded yet.</p>
          </div>
        ) : (
          <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '700', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderOpen size={18} style={{ color: '#1B5E37' }} /> Uploaded Menu Files ({assets.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {assets.map((asset: any) => (
                <div key={asset._id} className="glass-card" style={{ padding: 0, overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>
                  {getFileIcon(asset)}
                  <div style={{ padding: '14px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#1a1a2e', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>{(asset.size / 1024).toFixed(0)} KB</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a href={getViewUrl(asset)} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                        <button className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '12px' }}><Eye size={12} /> View</button>
                      </a>
                      <button className="btn-danger" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => { if (confirm('Delete this menu file?')) deleteMutation.mutate(asset._id); }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
