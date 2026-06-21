'use client';

import React, { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Trash2, UploadCloud, Image as ImageIcon, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MediaPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: async () => {
      const res = await api.get('/api/media');
      return res.data.media;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Media uploaded successfully!');
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to upload media');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/media/${id}`);
    },
    onSuccess: () => {
      toast.success('Media deleted');
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: () => {
      toast.error('Failed to delete media');
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error('File size exceeds 20MB limit');
        e.target.value = '';
        return;
      }
      uploadMutation.mutate(file);
      e.target.value = '';
    }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Media Library</h1>
          <p style={{ color: '#6b7280', margin: '8px 0 0', fontSize: '15px' }}>
            Permanently store images to use in your WhatsApp templates.
          </p>
        </div>
        
        <div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
          <button 
            className="btn-primary" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {uploadMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
            Upload Image
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', minHeight: '400px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '80px' }}>Loading media...</div>
        ) : !data || data.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ImageIcon size={48} style={{ color: '#d1d5db', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', margin: '0 0 8px' }}>No media uploaded</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>Upload your first image to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
            {data.map((item: any) => (
              <div key={item._id} style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', group: 'true' }}>
                <div style={{ paddingBottom: '100%', position: 'relative' }}>
                  <img 
                    src={item.url} 
                    alt={item.filename} 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                </div>
                <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '12px', color: '#374151', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                    {item.filename}
                  </div>
                  <button 
                    onClick={() => deleteMutation.mutate(item._id)}
                    disabled={deleteMutation.isPending}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                    title="Delete permanently"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
