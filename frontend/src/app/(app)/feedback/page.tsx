'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Star, MessageSquare } from 'lucide-react';

export default function FeedbackPage() {
  const { data: feedbackData, isLoading } = useQuery({
    queryKey: ['feedback_all'],
    queryFn: () => api.get('/api/feedback').then(r => r.data.data),
  });

  const { data: feedbackStats } = useQuery({
    queryKey: ['feedback_stats'],
    queryFn: () => api.get('/api/feedback/stats').then(r => r.data.data),
  });

  const renderStars = (rating: number) => {
    return Array(5).fill(0).map((_, i) => (
      <Star key={i} size={16} fill={i < rating ? "#F59E0B" : "transparent"} color={i < rating ? "#F59E0B" : "#D1D5DB"} />
    ));
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Customer Feedback</h1>
        <p className="page-subtitle">View and analyze feedback ratings from your reservations.</p>
      </div>

      <div style={{ padding: '0 32px' }}>
        <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', display: 'flex', gap: '32px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Average Rating</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '36px', fontWeight: '800', color: '#1a1a2e' }}>{feedbackStats?.averageRating || '0.0'}</span>
              <div style={{ display: 'flex' }}>
                <Star size={24} fill="#F59E0B" color="#F59E0B" />
              </div>
            </div>
          </div>
          <div style={{ width: '1px', height: '50px', background: '#E5E7EB' }} />
          <div>
            <div style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Total Ratings</div>
            <div style={{ fontSize: '36px', fontWeight: '800', color: '#1a1a2e' }}>{feedbackStats?.totalCount || 0}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="skeleton" style={{ height: '60px', marginBottom: '12px' }} />
            <div className="skeleton" style={{ height: '60px', marginBottom: '12px' }} />
          </div>
        ) : feedbackData?.length === 0 ? (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
            <MessageSquare size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h3 style={{ margin: '0 0 8px', color: '#374151', fontSize: '16px' }}>No Feedback Yet</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>Ratings will appear here when customers review their experience.</p>
          </div>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#FAFBFC', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280' }}>Phone Number</th>
                  <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280' }}>Rating</th>
                  <th style={{ padding: '16px 20px', fontSize: '13px', fontWeight: '600', color: '#6B7280' }}>Received At</th>
                </tr>
              </thead>
              <tbody>
                {feedbackData?.map((item: any) => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600', color: '#111827', fontSize: '14px' }}>
                      {item.phone}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {renderStars(item.rating === 1 ? 1 : item.rating === 2 ? 3 : 5)}
                        <span style={{ marginLeft: '8px', fontSize: '14px', color: '#374151', fontWeight: '600' }}>
                          {item.rating === 1 ? 'Poor (1)' : item.rating === 2 ? 'Good (3)' : 'Excellent (5)'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#6B7280', fontSize: '13px' }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
