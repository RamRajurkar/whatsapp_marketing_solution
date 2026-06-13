'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function MenuPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: assets, isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: () => api.get('/api/menu').then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/menu/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menu'] }); toast.success('Deleted'); },
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/api/menu/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Menu uploaded!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed. Check Cloudinary settings.');
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Menu Management</h1>
        <p className="page-subtitle">Upload and manage your restaurant menu files</p>
      </div>

      <div style={{ padding: '0 32px' }}>
        {/* Upload area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#25D366' : '#e2e8f0'}`,
            borderRadius: '20px', padding: '48px',
            textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'rgba(37, 211, 102, 0.04)' : 'white',
            transition: 'all 0.2s ease', marginBottom: '24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
          />
          {uploading ? (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>⏳</div>
              <p style={{ color: '#25D366', fontWeight: '600', fontSize: '16px', margin: 0 }}>Uploading...</p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>📤</div>
              <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '18px', fontWeight: '700' }}>
                Upload Menu Files
              </h3>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '14px' }}>
                Drag & drop or click to upload PDF menus or menu images
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <span style={{ padding: '6px 16px', background: '#fee2e2', color: '#dc2626', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>📄 PDF</span>
                <span style={{ padding: '6px 16px', background: '#dbeafe', color: '#2563eb', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>🖼️ JPEG/PNG</span>
                <span style={{ padding: '6px 16px', background: '#f1f5f9', color: '#64748b', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>Max 16MB</span>
              </div>
              <p style={{ margin: '16px 0 0', color: '#94a3b8', fontSize: '12px' }}>
                ⚠️ Cloudinary credentials required in Settings for uploads
              </p>
            </>
          )}
        </div>

        {/* Menu files grid */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: '200px', borderRadius: '16px' }} />)}
          </div>
        ) : !assets?.length ? (
          <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🍽️</div>
            <p>No menu files uploaded yet. Upload your menu PDF or images above.</p>
          </div>
        ) : (
          <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
              📂 Uploaded Menu Files ({assets.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {assets.map((asset: any) => (
                <div key={asset._id} className="glass-card" style={{ padding: '0', overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>
                  {asset.type === 'image' ? (
                    <img src={asset.url} alt={asset.name} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ height: '160px', background: 'linear-gradient(135deg, #fee2e2, #fecaca)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '48px' }}>📄</span>
                      <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>PDF Document</span>
                    </div>
                  )}
                  <div style={{ padding: '14px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {asset.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
                      {(asset.size / 1024).toFixed(0)} KB • {asset.type.toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a href={asset.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                        <button className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '12px' }}>👁️ View</button>
                      </a>
                      <button className="btn-danger" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => { if (confirm('Delete this file?')) deleteMutation.mutate(asset._id); }}>🗑️</button>
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
