'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Bot, Save, ToggleLeft, ToggleRight, MapPin, Clock, FileText,
  Smartphone, MessageCircle, CheckCircle2, AlertCircle, Sparkles,
  Info, ChevronRight, Code, RotateCcw, Send, Settings
} from 'lucide-react';
import { SimulatorPanel } from '@/components/SimulatorPanel';

/* ── Interactive Phone Preview Component ───────────────────────────────────── */
interface PhonePreviewProps {
  form: any;
  flow: any;
  activeTab: 'simple' | 'advanced';
}

function PhonePreview({ form, flow, activeTab }: PhonePreviewProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [context, setContext] = useState<any>({});

  // Reset/Initialize chat preview
  const resetChat = () => {
    setContext({});
    setInputValue('');
    
    if (activeTab === 'advanced' && flow && flow.nodes) {
      const startId = flow.startNode || 'node_welcome';
      setCurrentNodeId(startId);
      
      const startNode = flow.nodes[startId];
      if (startNode) {
        const initialMsgs: any[] = [
          {
            sender: 'user',
            type: 'text',
            text: 'Hi 👋',
            time: '12:00'
          }
        ];
        processNode(startId, startNode, initialMsgs, {});
      }
    } else {
      // Simple Mode fallback
      setCurrentNodeId(null);
      setMessages([
        {
          sender: 'user',
          type: 'text',
          text: 'Hi 👋',
          time: '12:00'
        },
        {
          sender: 'bot',
          type: 'interactive',
          text: form.welcomeMessage || 'Welcome to our Restaurant! 🍔 How can we help you today?',
          buttons: [
            { id: 'btn_address', title: '📍 Address' },
            { id: 'btn_menu', title: '📜 Menu' },
            { id: 'btn_timings', title: '🕒 Timings' }
          ],
          time: '12:00'
        }
      ]);
    }
  };

  // Re-run whenever the flow structure or mode changes
  useEffect(() => {
    resetChat();
  }, [flow, activeTab, form]);

  const processNode = (nodeId: string, node: any, currentMsgs: any[], currentContext: any) => {
    let nextMsgs = [...currentMsgs];
    let nextContext = { ...currentContext };
    
    // Resolve formatted text replacing placeholder variables
    const formatText = (text: string) => {
      let formatted = text || '';
      const varsMap = {
        business_name: 'TrendVibe Fashion',
        catalog_url: 'https://trendvibe-catalog.example.com',
        ...nextContext
      };
      for (const [k, v] of Object.entries(varsMap)) {
        formatted = formatted.replace(new RegExp(`{${k}}`, 'g'), String(v));
      }
      return formatted;
    };

    if (node.type === 'text') {
      nextMsgs.push({
        sender: 'bot',
        type: 'text',
        text: formatText(node.text),
        time: '12:01'
      });
      
      if (node.nextNode && flow.nodes[node.nextNode]) {
        // Automatically progress to next node
        processNode(node.nextNode, flow.nodes[node.nextNode], nextMsgs, nextContext);
      } else {
        // End of flow
        setCurrentNodeId(null);
      }
    } else if (node.type === 'interactive_button') {
      nextMsgs.push({
        sender: 'bot',
        type: 'interactive',
        text: formatText(node.text),
        buttons: node.buttons || [],
        time: '12:01'
      });
      setCurrentNodeId(nodeId);
    } else if (node.type === 'collect_input') {
      nextMsgs.push({
        sender: 'bot',
        type: 'collect_input',
        text: formatText(node.text),
        time: '12:01'
      });
      setCurrentNodeId(nodeId);
    } else if (node.type === 'action_node') {
      nextMsgs.push({
        sender: 'bot',
        type: 'action',
        text: `⚙️ Action: ${node.action || 'system_action'}`,
        time: '12:01'
      });
      
      // Update variables mapping if payload is provided
      if (node.payload) {
        for (const [k, v] of Object.entries(node.payload)) {
          if (typeof v === 'string') {
            let resolved = v;
            for (const [ctxK, ctxV] of Object.entries(nextContext)) {
              resolved = resolved.replace(new RegExp(`{${ctxK}}`, 'g'), String(ctxV));
            }
            nextContext[k] = resolved;
          } else {
            nextContext[k] = v;
          }
        }
      }

      if (node.nextNode && flow.nodes[node.nextNode]) {
        processNode(node.nextNode, flow.nodes[node.nextNode], nextMsgs, nextContext);
      } else {
        setCurrentNodeId(null);
      }
    }
    
    setMessages(nextMsgs);
    setContext(nextContext);
  };

  const handleButtonTap = (btn: any) => {
    // Append the clicked button as a user reply
    const newMsgs = [
      ...messages,
      {
        sender: 'user',
        type: 'text',
        text: btn.title || btn.id,
        time: '12:02'
      }
    ];
    setMessages(newMsgs);

    if (activeTab === 'advanced' && flow && flow.nodes) {
      if (btn.nextNode && flow.nodes[btn.nextNode]) {
        processNode(btn.nextNode, flow.nodes[btn.nextNode], newMsgs, context);
      } else {
        setCurrentNodeId(null);
      }
    } else {
      // Simple Mode responses mapping
      let responseText = '';
      if (btn.id === 'btn_address') {
        responseText = form.addressText || 'We are located at 123 Food Street. 📍';
      } else if (btn.id === 'btn_menu') {
        responseText = form.menuUrl ? `Here is our menu link: ${form.menuUrl}` : 'Our menu is not uploaded yet.';
      } else if (btn.id === 'btn_timings') {
        responseText = form.timingsText || 'We are open Monday to Sunday from 10 AM to 11 PM. 🕒';
      }
      
      setMessages([
        ...newMsgs,
        {
          sender: 'bot',
          type: 'text',
          text: responseText,
          time: '12:02'
        }
      ]);
    }
  };

  const handleSendInput = () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    setInputValue('');
    
    const newMsgs = [
      ...messages,
      {
        sender: 'user',
        type: 'text',
        text: text,
        time: '12:03'
      }
    ];
    setMessages(newMsgs);

    if (activeTab === 'advanced' && flow && flow.nodes && currentNodeId) {
      const node = flow.nodes[currentNodeId];
      if (node && node.type === 'collect_input') {
        const key = node.saveContextKey;
        const newContext = { ...context, [key]: text };
        setContext(newContext);
        
        if (node.nextNode && flow.nodes[node.nextNode]) {
          processNode(node.nextNode, flow.nodes[node.nextNode], newMsgs, newContext);
        } else {
          setCurrentNodeId(null);
        }
      }
    }
  };

  const isCollectingInput = activeTab === 'advanced' && currentNodeId && flow?.nodes?.[currentNodeId]?.type === 'collect_input';

  return (
    <div style={{ position: 'sticky', top: '24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px', padding: '0 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Smartphone size={16} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Live Preview
          </span>
        </div>
        <button
          onClick={resetChat}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
            color: '#10b981', border: '1px solid #10b981', padding: '3px 8px',
            borderRadius: '12px', background: 'none', cursor: 'pointer', transition: 'all 0.2s'
          }}
          title="Restart Conversation"
        >
          <RotateCcw size={10} />
          Reset Chat
        </button>
      </div>

      {/* Phone Frame */}
      <div style={{
        width: '100%', maxWidth: '320px',
        background: '#0B141A',
        borderRadius: '28px',
        padding: '8px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
        margin: '0 auto',
      }}>
        {/* Screen */}
        <div style={{
          background: '#0B141A',
          borderRadius: '22px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '420px'
        }}>
          {/* WhatsApp Header */}
          <div style={{
            background: '#1F2C34',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: '10px',
            flexShrink: 0
          }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #1B5E37, #25D366)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bot size={18} style={{ color: 'white' }} />
            </div>
            <div>
              <div style={{ color: 'white', fontSize: '14px', fontWeight: '600' }}>
                {activeTab === 'advanced' ? 'Fashion Assistant' : 'Your Restaurant'}
              </div>
              <div style={{ color: '#8696A0', fontSize: '11px' }}>online</div>
            </div>
          </div>

          {/* Chat Area */}
          <div style={{
            background: '#0B141A',
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'none\'/%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1\' fill=\'%23ffffff08\'/%3E%3Ccircle cx=\'60\' cy=\'40\' r=\'1\' fill=\'%23ffffff08\'/%3E%3Ccircle cx=\'80\' cy=\'70\' r=\'1\' fill=\'%23ffffff08\'/%3E%3C/svg%3E")',
            padding: '16px 12px',
            flexGrow: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {messages.map((msg, index) => {
              if (msg.sender === 'user') {
                return (
                  <div key={index} style={{ alignSelf: 'flex-end' }}>
                    <div style={{
                      background: '#005C4B',
                      color: 'white',
                      padding: '8px 12px',
                      borderRadius: '10px 10px 2px 10px',
                      fontSize: '13px',
                      maxWidth: '220px',
                      wordBreak: 'break-word'
                    }}>
                      {msg.text}
                      <span style={{ float: 'right', marginLeft: '8px', fontSize: '9px', color: '#8696A0', marginTop: '4px' }}>{msg.time}</span>
                    </div>
                  </div>
                );
              } else if (msg.type === 'action') {
                return (
                  <div key={index} style={{ alignSelf: 'center', margin: '4px 0' }}>
                    <div style={{
                      background: '#202C33',
                      color: '#8696A0',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      border: '1px dashed #3A4B54'
                    }}>
                      {msg.text}
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={index} style={{ alignSelf: 'flex-start', maxWidth: '250px' }}>
                    <div style={{
                      background: '#1F2C34',
                      borderRadius: '2px 10px 10px 10px',
                      overflow: 'hidden',
                    }}>
                      <div style={{ padding: '8px 12px' }}>
                        <p style={{
                          margin: 0, color: '#E9EDEF', fontSize: '13px', lineHeight: '1.45',
                          whiteSpace: 'pre-line', wordBreak: 'break-word',
                        }}>
                          {msg.text}
                        </p>
                        <span style={{ float: 'right', fontSize: '9px', color: '#8696A0', marginTop: '4px' }}>{msg.time}</span>
                      </div>
                      
                      {/* Interactive Buttons */}
                      {msg.type === 'interactive' && msg.buttons && msg.buttons.length > 0 && (
                        <div style={{ borderTop: '1px solid #2A3942' }}>
                          {msg.buttons.map((btn: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => handleButtonTap(btn)}
                              style={{
                                width: '100%',
                                padding: '10px',
                                textAlign: 'center',
                                color: '#53BDEB',
                                fontSize: '13px',
                                fontWeight: '500',
                                borderTop: i > 0 ? '1px solid #2A3942' : 'none',
                                background: 'none',
                                borderLeft: 'none',
                                borderRight: 'none',
                                borderBottom: 'none',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A3942'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              {btn.title || btn.id}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            })}
          </div>

          {/* Chat Input Area (Active during input collection) */}
          <div style={{
            background: '#1F2C34',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderTop: '1px solid #2A3942',
            flexShrink: 0
          }}>
            <input
              type="text"
              placeholder={isCollectingInput ? "Type response here..." : "Chatbot locked..."}
              disabled={!isCollectingInput}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendInput()}
              style={{
                flexGrow: 1,
                background: isCollectingInput ? '#2A3942' : '#111B21',
                border: 'none',
                borderRadius: '18px',
                padding: '8px 14px',
                color: isCollectingInput ? 'white' : '#8696A0',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSendInput}
              disabled={!isCollectingInput}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isCollectingInput ? '#00A884' : '#2A3942',
                color: 'white',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isCollectingInput ? 'pointer' : 'default',
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Status Badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '6px 14px', borderRadius: '20px',
      background: isActive ? '#E8F5E9' : '#FEE2E2',
      color: isActive ? '#1B5E37' : '#B91C1C',
      fontSize: '12px', fontWeight: '600',
    }}>
      {isActive ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {isActive ? 'Bot Active' : 'Bot Inactive'}
    </div>
  );
}

/* ── Main Chatbot Configuration Page ────────────────────────────────────────── */
export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('simple');
  
  // Tab 1 (Simple Settings Form State)
  const [form, setForm] = useState({
    isActive: false,
    welcomeMessage: '',
    addressText: '',
    menuUrl: '',
    timingsText: '',
    openHour: 11,
    closeHour: 23,
  });

  // Tab 2 (Advanced Flow JSON String State)
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Fetch simple settings
  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['bot_settings'],
    queryFn: () => api.get('/api/bot').then((res) => res.data),
  });

  // Fetch advanced chatbot flow schema
  const { data: flowData, isLoading: isFlowLoading } = useQuery({
    queryKey: ['bot_flow'],
    queryFn: () => api.get('/api/bot/flow').then((res) => res.data),
  });

  // Load simple settings from DB
  useEffect(() => {
    if (settings) {
      setForm({
        isActive: settings.isActive || false,
        welcomeMessage: settings.welcomeMessage || '',
        addressText: settings.addressText || '',
        menuUrl: settings.menuUrl || '',
        timingsText: settings.timingsText || '',
        openHour: settings.openHour ?? 11,
        closeHour: settings.closeHour ?? 23,
      });
    }
  }, [settings]);

  // Load flow data from DB & strip internal MongoDB keys
  useEffect(() => {
    if (flowData) {
      const { _id, createdAt, updatedAt, tenantId, ...cleanFlow } = flowData;
      setJsonText(JSON.stringify(cleanFlow, null, 2));
      setJsonError(null);
    }
  }, [flowData]);

  // Validate JSON string live
  const handleJsonChange = (val: string) => {
    setJsonText(val);
    try {
      if (!val.trim()) {
        setJsonError('JSON configuration cannot be empty');
        return;
      }
      const parsed = JSON.parse(val);
      if (!parsed.flowId) throw new Error('Missing top-level "flowId" field');
      if (!parsed.startNode) throw new Error('Missing top-level "startNode" field');
      if (!parsed.nodes) throw new Error('Missing top-level "nodes" object');
      if (typeof parsed.nodes !== 'object') throw new Error('"nodes" must be a dictionary/object');
      
      // Basic node validations
      for (const [nodeId, node] of Object.entries(parsed.nodes) as any) {
        if (!node.type) throw new Error(`Node "${nodeId}" is missing "type" field`);
        if (node.type === 'interactive_button') {
          if (!node.text) throw new Error(`Node "${nodeId}" must have "text" prompt`);
          if (!node.buttons || !Array.isArray(node.buttons)) throw new Error(`Node "${nodeId}" of type interactive_button must have a list of "buttons"`);
        } else if (node.type === 'collect_input') {
          if (!node.text) throw new Error(`Node "${nodeId}" must have "text" prompt`);
          if (!node.saveContextKey) throw new Error(`Node "${nodeId}" must declare "saveContextKey"`);
        } else if (node.type === 'text') {
          if (!node.text) throw new Error(`Node "${nodeId}" must specify a "text" message`);
        }
      }
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  // Mutation to update simple settings
  const updateSettingsMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/api/bot', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot_settings'] });
      toast.success('Chatbot settings saved successfully!');
    },
    onError: () => {
      toast.error('Failed to save chatbot settings.');
    },
  });

  // Mutation to update advanced JSON flow
  const updateFlowMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/bot/flow', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot_flow'] });
      toast.success('Chatbot state-machine flow updated!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update chatbot flow schema.');
    },
  });

  // Unified save action
  const handleSave = () => {
    if (activeTab === 'simple') {
      updateSettingsMutation.mutate(form);
    } else {
      if (jsonError) {
        toast.error(`Please resolve JSON errors first: ${jsonError}`);
        return;
      }
      try {
        const parsed = JSON.parse(jsonText);
        updateFlowMutation.mutate(parsed);
      } catch (e: any) {
        toast.error(`Invalid JSON formatting: ${e.message}`);
      }
    }
  };

  // Resolve parsed flow dynamically for simulator and preview
  let parsedFlow: any = null;
  try {
    parsedFlow = JSON.parse(jsonText);
  } catch (e) {
    parsedFlow = flowData;
  }

  const isLoading = isSettingsLoading || isFlowLoading;

  if (isLoading) {
    return (
      <div style={{ padding: '32px' }}>
        <div className="skeleton" style={{ height: '24px', width: '200px', borderRadius: '8px', marginBottom: '12px' }} />
        <div className="skeleton" style={{ height: '400px', borderRadius: '16px' }} />
      </div>
    );
  }

  const isPending = updateSettingsMutation.isPending || updateFlowMutation.isPending;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-title">Chatbot Settings</h1>
            <p className="page-subtitle">Configure your automated interactive welcome flow</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <StatusBadge isActive={form.isActive} />
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={isPending}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Save size={16} />
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Tab Headers */}
        <div style={{
          display: 'flex', gap: '8px', borderBottom: '1px solid #E5E7EB',
          marginTop: '20px', paddingBottom: '0'
        }}>
          <button
            onClick={() => setActiveTab('simple')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', fontSize: '13px', fontWeight: '600',
              borderBottom: activeTab === 'simple' ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === 'simple' ? '#0f766e' : '#6b7280',
              background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              cursor: 'pointer', transition: 'all 0.2s', paddingBottom: '12px'
            }}
          >
            <Settings size={14} />
            Simple Mode (Settings)
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', fontSize: '13px', fontWeight: '600',
              borderBottom: activeTab === 'advanced' ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === 'advanced' ? '#0f766e' : '#6b7280',
              background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              cursor: 'pointer', transition: 'all 0.2s', paddingBottom: '12px'
            }}
          >
            <Code size={14} />
            Advanced Flow Mode (JSON)
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px', maxWidth: '1100px' }}>
        {/* ── Left Column: Config Panel ── */}
        <div>
          {/* Toggle Card */}
          <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: form.isActive ? 'linear-gradient(135deg, #1B5E37, #25D366)' : '#f3f4f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s',
                }}>
                  <Bot size={22} style={{ color: form.isActive ? 'white' : '#9ca3af' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>
                    Interactive Welcome Flow
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
                    {activeTab === 'advanced' ? 'Control advanced state-machine bot responses' : 'Auto-greet new customers with interactive quick-reply buttons'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setForm({ ...form, isActive: !form.isActive })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.isActive ? '#1B5E37' : '#9CA3AF', transition: 'color 0.2s' }}
                aria-label="Toggle chatbot"
              >
                {form.isActive ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
              </button>
            </div>
          </div>

          {/* Simple Tab Panel */}
          {activeTab === 'simple' && (
            <div style={{ opacity: form.isActive ? 1 : 0.5, pointerEvents: form.isActive ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
              {/* How It Works */}
              <div className="glass-card" style={{
                padding: '16px 20px', marginBottom: '20px',
                background: '#FAFBFC', border: '1px solid #E5E7EB',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Info size={14} style={{ color: '#6b7280' }} />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>How It Works</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    'Customer sends "Hi", "Hello", "Hey", "Menu", "Help", or "Start"',
                    'Bot replies with your welcome message + 3 interactive buttons',
                    'Customer taps a button → Bot sends the configured response',
                  ].map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                        background: '#1B5E37', color: 'white', fontSize: '11px', fontWeight: '700',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {i + 1}
                      </div>
                      <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Restaurant Hours */}
              <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Clock size={16} style={{ color: '#F59E0B' }} />
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>Operating Hours</h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Opening Hour (24H)</label>
                    <input
                      type="number"
                      min="0" max="23"
                      className="input-field"
                      value={form.openHour}
                      onChange={(e) => setForm({ ...form, openHour: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Closing Hour (24H)</label>
                    <input
                      type="number"
                      min="0" max="23"
                      className="input-field"
                      value={form.closeHour}
                      onChange={(e) => setForm({ ...form, closeHour: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>
                  Used by the bot to send "We're open for lunch/dinner" or "We're currently closed" automatically based on the time of day.
                </p>
              </div>

              {/* Welcome Message */}
              <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Sparkles size={16} style={{ color: '#F59E0B' }} />
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>Welcome Message</h4>
                </div>
                <textarea
                  className="input-field"
                  rows={3}
                  value={form.welcomeMessage}
                  onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
                  placeholder="Welcome to our Restaurant! 🍔 How can we help you today?"
                  style={{ resize: 'vertical' }}
                />
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MessageCircle size={10} />
                  Sent along with 3 interactive buttons: [📍 Address] [📜 Menu] [🕒 Timings]
                </p>
              </div>

              {/* Button Responses */}
              <div className="glass-card" style={{ padding: '20px' }}>
                <h4 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '700', color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ChevronRight size={16} style={{ color: '#1B5E37' }} />
                  Button Responses
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#6b7280' }}>
                  Configure what the bot replies when a customer taps each button.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Address */}
                  <div style={{
                    padding: '16px', background: '#FAFBFC', borderRadius: '12px',
                    border: '1px solid #E5E7EB',
                  }}>
                    <label style={{
                      fontSize: '13px', fontWeight: '600', color: '#374151',
                      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                    }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <MapPin size={14} style={{ color: '#EF4444' }} />
                      </div>
                      Address Response
                    </label>
                    <textarea
                      className="input-field"
                      rows={2}
                      value={form.addressText}
                      onChange={(e) => setForm({ ...form, addressText: e.target.value })}
                      placeholder="We are located at 123 Food Street. 📍 Google Maps: https://maps.app.goo.gl/..."
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  {/* Menu */}
                  <div style={{
                    padding: '16px', background: '#FAFBFC', borderRadius: '12px',
                    border: '1px solid #E5E7EB',
                  }}>
                    <label style={{
                      fontSize: '13px', fontWeight: '600', color: '#374151',
                      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                    }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <FileText size={14} style={{ color: '#3B82F6' }} />
                      </div>
                      Menu Link Response
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={form.menuUrl}
                      onChange={(e) => setForm({ ...form, menuUrl: e.target.value })}
                      placeholder="https://yourwebsite.com/menu.pdf"
                    />
                    <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>
                      Paste a public URL to your menu PDF or image. You can upload one in Menu Management.
                    </p>
                  </div>

                  {/* Timings */}
                  <div style={{
                    padding: '16px', background: '#FAFBFC', borderRadius: '12px',
                    border: '1px solid #E5E7EB',
                  }}>
                    <label style={{
                      fontSize: '13px', fontWeight: '600', color: '#374151',
                      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                    }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Clock size={14} style={{ color: '#F59E0B' }} />
                      </div>
                      Timings Response
                    </label>
                    <textarea
                      className="input-field"
                      rows={2}
                      value={form.timingsText}
                      onChange={(e) => setForm({ ...form, timingsText: e.target.value })}
                      placeholder="We are open Monday to Sunday from 10 AM to 11 PM. 🕒"
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Tab Panel (JSON Flow Editor) */}
          {activeTab === 'advanced' && (
            <div style={{ opacity: form.isActive ? 1 : 0.5, pointerEvents: form.isActive ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
              {/* Guidelines */}
              <div className="glass-card" style={{
                padding: '16px 20px', marginBottom: '20px',
                background: '#F8FAFC', border: '1px solid #E2E8F0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Code size={15} style={{ color: '#0f766e' }} />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    JSON Schema Rules
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li><strong>Nodes Dictionary</strong>: List conversational states. Supported types: <code>text</code>, <code>interactive_button</code>, <code>collect_input</code>, and <code>action_node</code>.</li>
                  <li><strong>Format Variables</strong>: Use placeholders like <code>{`{business_name}`}</code> or collected inputs like <code>{`{guests}`}</code> in bot text strings.</li>
                  <li><strong>User Input</strong>: A <code>collect_input</code> node requires a <code>saveContextKey</code>, and will store the user's response in memory before passing to <code>nextNode</code>.</li>
                </ul>
              </div>

              {/* JSON Editor Field */}
              <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'block' }}>
                    State-Machine JSON Flow
                  </label>
                  {jsonError ? (
                    <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} />
                      {jsonError}
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#10B981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} />
                      JSON Valid
                    </span>
                  )}
                </div>

                <textarea
                  value={jsonText}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  rows={18}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#0F172A',
                    color: '#94A3B8',
                    border: jsonError ? '1px solid #EF4444' : '1px solid #334155',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                  placeholder="Enter flow JSON schema..."
                />
              </div>
            </div>
          )}

          {/* Webhook Simulator (Only in Dev Mode) */}
          <SimulatorPanel flowData={parsedFlow} />
        </div>

        {/* ── Right Column: Interactive Phone Preview ── */}
        <PhonePreview form={form} flow={parsedFlow} activeTab={activeTab} />
      </div>
    </div>
  );
}
