'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Briefcase,
  Users,
  CreditCard,
  TrendingUp,
  Plus,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Building,
  CheckCircle2,
  Receipt
} from 'lucide-react';

export default function AgencyPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'clients' | 'ledger'>('clients');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);

  // Form states
  const [clientForm, setClientForm] = useState({
    name: '',
    adminEmail: '',
    adminName: '',
    plan: 'starter',
    enabledChannels: ['whatsapp', 'gbp']
  });

  const [ledgerForm, setLedgerForm] = useState({
    clientTenantId: '',
    entryType: 'wholesale_charge',
    amount: 0,
    description: ''
  });

  // 1. Fetch agency clients
  const { data: clientsData, isLoading: loadingClients, refetch: refetchClients } = useQuery({
    queryKey: ['agency_clients'],
    queryFn: async () => {
      const res = await api.get('/api/agency/clients');
      return res.data;
    }
  });

  // 2. Fetch agency billing ledger
  const { data: ledgerData, isLoading: loadingLedger, refetch: refetchLedger } = useQuery({
    queryKey: ['agency_ledger'],
    queryFn: async () => {
      const res = await api.get('/api/agency/ledger');
      return res.data;
    }
  });

  // Provision client mutation
  const createClientMutation = useMutation({
    mutationFn: async (payload: typeof clientForm) => {
      const res = await api.post('/api/agency/clients', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Client provisioned successfully');
      queryClient.invalidateQueries({ queryKey: ['agency_clients'] });
      setIsClientModalOpen(false);
      setClientForm({
        name: '',
        adminEmail: '',
        adminName: '',
        plan: 'starter',
        enabledChannels: ['whatsapp', 'gbp']
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to provision client');
    }
  });

  // Record ledger entry mutation
  const recordLedgerMutation = useMutation({
    mutationFn: async (payload: typeof ledgerForm) => {
      const res = await api.post('/api/agency/ledger/entry', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Billing entry recorded');
      queryClient.invalidateQueries({ queryKey: ['agency_ledger'] });
      setIsLedgerModalOpen(false);
      setLedgerForm({
        clientTenantId: '',
        entryType: 'wholesale_charge',
        amount: 0,
        description: ''
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to record entry');
    }
  });

  const clients = clientsData?.clients || [];
  const ledgerEntries = ledgerData?.entries || [];
  const netBalance = ledgerData?.netBalance || 0;
  const totalCredits = ledgerData?.totalCredits || 0;
  const totalDebits = ledgerData?.totalDebits || 0;

  return (
    <div style={{ padding: '24px 32px' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Briefcase size={26} color="#4F46E5" />
              Agency Workspace & Wholesale Ledger
            </h1>
            <p className="page-subtitle">
              Manage client sub-accounts, provision multi-channel tenants, and track wholesale vs revenue-share ledgers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { refetchClients(); refetchLedger(); }}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={() => setIsClientModalOpen(true)}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> Provision Client
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Managed Clients</span>
            <Users size={18} color="#4F46E5" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: '#111827' }}>
            {loadingClients ? '...' : clients.length}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Wholesale Debits</span>
            <ArrowDownLeft size={18} color="#EF4444" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: '#EF4444' }}>
            ${totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Rev-Share Credits</span>
            <ArrowUpRight size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: '#10B981' }}>
            ${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '600' }}>Net Balance</span>
            <CreditCard size={18} color="#2563EB" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: netBalance >= 0 ? '#10B981' : '#EF4444' }}>
            ${netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('clients')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            fontWeight: '600',
            fontSize: '13px',
            cursor: 'pointer',
            background: activeTab === 'clients' ? '#4F46E5' : 'transparent',
            color: activeTab === 'clients' ? '#FFFFFF' : '#6B7280'
          }}
        >
          Managed Clients ({clients.length})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            fontWeight: '600',
            fontSize: '13px',
            cursor: 'pointer',
            background: activeTab === 'ledger' ? '#4F46E5' : 'transparent',
            color: activeTab === 'ledger' ? '#FFFFFF' : '#6B7280'
          }}
        >
          Billing Ledger ({ledgerEntries.length})
        </button>
      </div>

      {/* Tab 1: Clients */}
      {activeTab === 'clients' && (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>CLIENT TENANT</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>PLAN</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>ENABLED CHANNELS</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>STATUS</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {loadingClients ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
                    Loading agency clients...
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
                    No client tenants provisioned yet. Click "Provision Client" above to create one.
                  </td>
                </tr>
              ) : (
                clients.map((c: any) => (
                  <tr key={c._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace' }}>ID: {c._id}</div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        background: '#EEF2FF',
                        color: '#4338CA'
                      }}>
                        {c.plan || 'starter'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {(c.enabledChannels || ['whatsapp']).map((ch: string) => (
                          <span
                            key={ch}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600',
                              background: ch === 'whatsapp' ? '#DCFCE7' : '#DBEAFE',
                              color: ch === 'whatsapp' ? '#166534' : '#1E40AF'
                            }}
                          >
                            {ch.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: '#DCFCE7',
                        color: '#15803D'
                      }}>
                        {c.status || 'active'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '12px', color: '#6B7280' }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Ledger */}
      {activeTab === 'ledger' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button
              onClick={() => setIsLedgerModalOpen(true)}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <Receipt size={14} /> Record Ledger Entry
            </button>
          </div>

          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>ENTRY TYPE</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>CLIENT TENANT ID</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>DESCRIPTION</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>AMOUNT</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>STATUS</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>DATE</th>
                </tr>
              </thead>
              <tbody>
                {loadingLedger ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
                      Loading ledger entries...
                    </td>
                  </tr>
                ) : ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
                      No ledger transactions found.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((e: any) => (
                    <tr key={e._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: e.entryType === 'revenue_share_commission' ? '#DCFCE7' : '#FEE2E2',
                          color: e.entryType === 'revenue_share_commission' ? '#166534' : '#991B1B'
                        }}>
                          {e.entryType.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontSize: '12px', color: '#374151' }}>
                        {e.clientTenantId || 'N/A'}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '13px', color: '#111827' }}>
                        {e.description || '—'}
                      </td>
                      <td style={{
                        padding: '14px 18px',
                        fontSize: '14px',
                        fontWeight: '700',
                        color: e.entryType === 'revenue_share_commission' ? '#10B981' : '#EF4444'
                      }}>
                        {e.entryType === 'revenue_share_commission' ? '+' : '-'}${e.amount?.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: '#F3F4F6',
                          color: '#374151'
                        }}>
                          {e.status || 'settled'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#6B7280' }}>
                        {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provision Client Modal */}
      {isClientModalOpen && (
        <div className="modal-overlay" onClick={() => setIsClientModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>Provision Client Tenant</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Business / Tenant Name *</label>
                <input
                  className="input-field"
                  placeholder="e.g. Apex Hospitality"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Client Admin Name *</label>
                <input
                  className="input-field"
                  placeholder="e.g. Sarah Connor"
                  value={clientForm.adminName}
                  onChange={(e) => setClientForm({ ...clientForm, adminName: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Client Admin Email *</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="sarah@apex.com"
                  value={clientForm.adminEmail}
                  onChange={(e) => setClientForm({ ...clientForm, adminEmail: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Plan Tier</label>
                <select
                  className="input-field"
                  value={clientForm.plan}
                  onChange={(e) => setClientForm({ ...clientForm, plan: e.target.value })}
                >
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button className="btn-secondary" onClick={() => setIsClientModalOpen(false)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => createClientMutation.mutate(clientForm)}
                disabled={!clientForm.name || !clientForm.adminEmail || !clientForm.adminName}
              >
                Provision Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Ledger Modal */}
      {isLedgerModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLedgerModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700' }}>Record Ledger Entry</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Client Tenant ID *</label>
                <input
                  className="input-field"
                  placeholder="Enter tenant ID..."
                  value={ledgerForm.clientTenantId}
                  onChange={(e) => setLedgerForm({ ...ledgerForm, clientTenantId: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Transaction Type</label>
                <select
                  className="input-field"
                  value={ledgerForm.entryType}
                  onChange={(e) => setLedgerForm({ ...ledgerForm, entryType: e.target.value })}
                >
                  <option value="wholesale_charge">Wholesale Charge (Debit)</option>
                  <option value="revenue_share_commission">Rev Share Commission (Credit)</option>
                  <option value="payout">Payout</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Amount ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={ledgerForm.amount}
                  onChange={(e) => setLedgerForm({ ...ledgerForm, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>Description</label>
                <input
                  className="input-field"
                  placeholder="e.g. Monthly wholesale platform fee"
                  value={ledgerForm.description}
                  onChange={(e) => setLedgerForm({ ...ledgerForm, description: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button className="btn-secondary" onClick={() => setIsLedgerModalOpen(false)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => recordLedgerMutation.mutate(ledgerForm)}
                disabled={!ledgerForm.clientTenantId || ledgerForm.amount <= 0}
              >
                Record Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
