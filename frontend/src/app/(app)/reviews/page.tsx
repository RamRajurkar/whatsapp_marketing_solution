'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Star,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Send,
  MapPin,
  CheckCircle2,
  Clock
} from 'lucide-react';

export default function GmbReviewsPage() {
  const queryClient = useQueryClient();
  const [replyingReview, setReplyingReview] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // Fetch GMB reviews from real API
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['gmb_reviews'],
    queryFn: async () => {
      const res = await api.get('/api/gmb/reviews');
      return res.data;
    }
  });

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: async ({ reviewId, replyComment, generateWithAi }: any) => {
      const res = await api.post(`/api/gmb/reviews/${reviewId}/reply`, {
        replyComment,
        generateWithAi
      });
      return res.data;
    },
    onSuccess: (resData) => {
      toast.success(resData.message || 'Review reply submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['gmb_reviews'] });
      setReplyingReview(null);
      setReplyText('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to submit reply');
    }
  });

  const reviews = data?.reviews || [];
  const total = data?.total || 0;

  const renderStars = (rating: number) => {
    return (
      <div style={{ display: 'flex', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            size={16}
            fill={s <= rating ? '#F59E0B' : 'transparent'}
            color={s <= rating ? '#F59E0B' : '#D1D5DB'}
          />
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: '24px 32px' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Star size={26} color="#F59E0B" fill="#F59E0B" />
              Google Business Profile Reviews
            </h1>
            <p className="page-subtitle">
              Manage real-time customer reviews across your connected GBP storefront locations.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Total Reviews</span>
          <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '6px', color: '#111827' }}>
            {isLoading ? '...' : total}
          </div>
        </div>
        <div className="glass-card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Channel Source</span>
          <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '6px', color: '#2563EB' }}>
            Google Business Profile
          </div>
        </div>
        <div className="glass-card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Multi-Tenant Isolation</span>
          <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '6px', color: '#10B981' }}>
            Active & Scoped
          </div>
        </div>
      </div>

      {/* Reviews Table / Feed */}
      {isLoading ? (
        <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
          Loading Google reviews...
        </div>
      ) : reviews.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
          <MessageSquare size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
          <h3 style={{ margin: '0 0 8px', color: '#111827', fontSize: '16px' }}>No Google Reviews Yet</h3>
          <p style={{ margin: 0, fontSize: '14px' }}>
            Reviews synchronized from your Google Business Profile will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>REVIEWER</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>RATING</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>COMMENT / FEEDBACK</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>REPLY STATUS</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r: any) => (
                <tr key={r._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div className="reviewer-name" style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
                      {r.reviewerName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace' }}>
                      {r.reviewId}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    {renderStars(r.starRating || 5)}
                  </td>
                  <td style={{ padding: '14px 18px', maxWidth: '380px' }}>
                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {r.comment || 'No written text review provided.'}
                    </div>
                    {r.replyComment && (
                      <div style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        borderLeft: '3px solid #2563EB',
                        fontSize: '12px',
                        color: '#1E40AF'
                      }}>
                        <strong>Owner Reply:</strong> {r.replyComment}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      background: r.replyStatus === 'replied' ? '#DCFCE7' : '#FEF3C7',
                      color: r.replyStatus === 'replied' ? '#166534' : '#92400E'
                    }}>
                      {r.replyStatus === 'replied' ? 'Replied' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <button
                      onClick={() => {
                        setReplyingReview(r);
                        setReplyText(r.replyComment || '');
                      }}
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      {r.replyStatus === 'replied' ? 'Edit Reply' : 'Reply'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reply Modal */}
      {replyingReview && (
        <div className="modal-overlay" onClick={() => setReplyingReview(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>
              Reply to {replyingReview.reviewerName}
            </h3>
            <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', background: '#F9FAFB', fontSize: '13px' }}>
              <div style={{ marginBottom: '4px' }}>{renderStars(replyingReview.starRating)}</div>
              <p style={{ margin: 0, color: '#374151', fontStyle: 'italic' }}>"{replyingReview.comment}"</p>
            </div>

            <textarea
              className="input-field"
              rows={4}
              placeholder="Write your public response..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              style={{ resize: 'vertical', width: '100%', marginBottom: '16px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#7C3AED' }}
                onClick={() => {
                  replyMutation.mutate({
                    reviewId: replyingReview.reviewId,
                    generateWithAi: true
                  });
                }}
              >
                <Sparkles size={14} /> Auto-Generate with AI
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" onClick={() => setReplyingReview(null)}>Cancel</button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    replyMutation.mutate({
                      reviewId: replyingReview.reviewId,
                      replyComment: replyText,
                      generateWithAi: false
                    });
                  }}
                  disabled={!replyText.trim()}
                >
                  Post Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
