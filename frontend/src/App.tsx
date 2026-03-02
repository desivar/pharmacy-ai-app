import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  AlertTriangle, ShoppingCart, Activity, Plus, Trash2,
  Edit3, MessageCircle, TrendingUp, Bell, X, Check, Send, RefreshCw
} from 'lucide-react';

const API = 'http://localhost:8000';

interface Medicine {
  id: number;
  name: string;
  stock: number;
  expiry: string;
  provider: string;
  min_stock: number;
  unit_price: number;
  is_expiring_soon: boolean;
  is_expired: boolean;
  needs_restock: boolean;
}

interface Alert { id: number; name: string; message: string; priority: string; }
interface WAMessage { provider: string; message: string; medicines: string[]; }
interface Prediction { name: string; current_stock: number; predicted_days_until_empty: number; recommended_order_qty: number; trend: string; }
interface ChatMsg { role: 'user' | 'ai'; text: string; }

const TABS = ['Inventory', 'Alerts', 'Predictions', 'AI Chat'] as const;
type Tab = typeof TABS[number];

const priorityColor: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const trendIcon: Record<string, string> = {
  increasing: '📈',
  stable: '➡️',
  decreasing: '📉',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('Inventory');
  const [items, setItems] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Medicine | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [waMessages, setWaMessages] = useState<WAMessage[]>([]);
  const [supplierPhone, setSupplierPhone] = useState('');
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [predSummary, setPredSummary] = useState('');
  const [predLoading, setPredLoading] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([{ role: 'ai', text: "Hi! I'm your pharmacy AI. Ask me anything about your inventory, stock levels, expiry dates, or sales predictions." }]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ name: '', stock: '', expiry: '', provider: '', min_stock: '20', unit_price: '10' });

  const loadInventory = async () => {
    try {
      const res = await axios.get(`${API}/inventory`);
      setItems(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadInventory(); }, []);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [chat]);

  const sell = async (id: number) => {
    await axios.post(`${API}/sell`, { item_id: id, quantity: 1 });
    loadInventory();
  };

  const deleteItem = async (id: number) => {
    if (!window.confirm('Delete this medicine?')) return;
    await axios.delete(`${API}/inventory/${id}`);
    loadInventory();
  };

  const submitForm = async () => {
    const payload = {
      name: form.name,
      stock: Number(form.stock),
      expiry: form.expiry,
      provider: form.provider,
      min_stock: Number(form.min_stock),
      unit_price: Number(form.unit_price),
    };
    if (editItem) {
      await axios.put(`${API}/inventory/${editItem.id}`, payload);
    } else {
      await axios.post(`${API}/inventory`, payload);
    }
    setShowAdd(false);
    setEditItem(null);
    setForm({ name: '', stock: '', expiry: '', provider: '', min_stock: '20', unit_price: '10' });
    loadInventory();
  };

  const openEdit = (item: Medicine) => {
    setEditItem(item);
    setForm({ name: item.name, stock: String(item.stock), expiry: item.expiry, provider: item.provider, min_stock: String(item.min_stock), unit_price: String(item.unit_price) });
    setShowAdd(true);
  };

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const res = await axios.get(`${API}/ai/alerts`);
      setAlerts(res.data.alerts || []);
      setWaMessages(res.data.whatsapp_messages || []);
      setSupplierPhone(res.data.supplier_whatsapp || '');
    } catch (e) { console.error(e); }
    setAlertsLoading(false);
  };

  const loadPredictions = async () => {
    setPredLoading(true);
    try {
      const res = await axios.get(`${API}/ai/predictions`);
      setPredictions(res.data.predictions || []);
      setPredSummary(res.data.summary || '');
    } catch (e) { console.error(e); }
    setPredLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatInput('');
    setChat(c => [...c, { role: 'user', text: msg }]);
    setChatLoading(true);
    try {
      const res = await axios.post(`${API}/ai/chat`, { message: msg });
      setChat(c => [...c, { role: 'ai', text: res.data.response }]);
    } catch (e) {
      setChat(c => [...c, { role: 'ai', text: 'Could not connect to AI. Make sure backend is running and GROQ_API_KEY is set.' }]);
    }
    setChatLoading(false);
  };

  const whatsappLink = (phone: string, message: string) =>
    `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const S: Record<string, React.CSSProperties> = {
    app: { minHeight: '100vh', backgroundColor: '#0a0f1e', fontFamily: "'Syne', sans-serif", color: '#e2e8f0' },
    header: { background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 100%)', borderBottom: '1px solid #1e3a5f', padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
    logo: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '22px', fontWeight: 800, color: '#38bdf8', letterSpacing: '-0.5px' },
    tabs: { display: 'flex', gap: '4px', background: '#0d1b3e', padding: '4px', borderRadius: '12px', border: '1px solid #1e3a5f' },
    tab: (active: boolean): React.CSSProperties => ({ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: "'Syne', sans-serif", background: active ? '#38bdf8' : 'transparent', color: active ? '#0a0f1e' : '#94a3b8', transition: 'all 0.2s' }),
    body: { padding: '30px 40px' },
    card: { background: 'linear-gradient(135deg, #0d1b3e 0%, #0f2347 100%)', border: '1px solid #1e3a5f', borderRadius: '16px', padding: '22px', position: 'relative' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' },
    badge: (color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: color + '22', color: color }),
    btn: (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: "'Syne', sans-serif", background: color, color: color === 'transparent' ? '#94a3b8' : '#fff', transition: 'opacity 0.2s' }),
    input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e3a5f', background: '#0a0f1e', color: '#e2e8f0', fontSize: '14px', fontFamily: "'Syne', sans-serif", boxSizing: 'border-box' as const },
    modal: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modalBox: { background: '#0d1b3e', border: '1px solid #1e3a5f', borderRadius: '20px', padding: '30px', width: '420px', maxWidth: '90vw' },
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={S.app}>

        {/* Header */}
        <header style={S.header}>
          <div style={S.logo}>
            <Activity size={28} color="#38bdf8" />
            PharmAI Dashboard
          </div>
          <div style={S.tabs}>
            {TABS.map(t => (
              <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div style={S.badge('#ef4444')}>
            <Bell size={12} /> {items.filter(i => i.needs_restock || i.is_expiring_soon).length} alerts
          </div>
        </header>

        <div style={S.body}>

          {/* ── INVENTORY ── */}
          {tab === 'Inventory' && (
            <>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <input style={{ ...S.input, flex: 1, minWidth: '200px' }} placeholder="🔍 Search medicines..." value={search} onChange={e => setSearch(e.target.value)} />
                <button style={S.btn('#38bdf8')} onClick={() => { setEditItem(null); setForm({ name: '', stock: '', expiry: '', provider: '', min_stock: '20', unit_price: '10' }); setShowAdd(true); }}>
                  <Plus size={16} /> Add Medicine
                </button>
                <button style={S.btn('#1e3a5f')} onClick={loadInventory}><RefreshCw size={16} /></button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#38bdf8' }}>Loading inventory...</div>
              ) : (
                <div style={S.grid}>
                  {filtered.map(item => (
                    <div key={item.id} style={{ ...S.card, borderLeft: `3px solid ${item.needs_restock || item.is_expired ? '#ef4444' : item.is_expiring_soon ? '#f59e0b' : '#22c55e'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>{item.name}</h3>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => openEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#38bdf8' }}><Edit3 size={15} /></button>
                          <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.8' }}>
                        <div>Stock: <span style={{ color: item.stock < item.min_stock ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{item.stock}</span> / min {item.min_stock}</div>
                        <div>Expiry: <span style={{ color: item.is_expired ? '#ef4444' : item.is_expiring_soon ? '#f59e0b' : '#94a3b8' }}>{item.expiry}</span></div>
                        <div>Provider: {item.provider}</div>
                        <div>Price: ${item.unit_price}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '10px 0' }}>
                        {item.is_expired && <span style={S.badge('#ef4444')}><AlertTriangle size={10} /> Expired</span>}
                        {item.is_expiring_soon && !item.is_expired && <span style={S.badge('#f59e0b')}><AlertTriangle size={10} /> Expiring Soon</span>}
                        {item.needs_restock && <span style={S.badge('#ef4444')}>⚠ Low Stock</span>}
                        {!item.needs_restock && !item.is_expiring_soon && !item.is_expired && <span style={S.badge('#22c55e')}><Check size={10} /> OK</span>}
                      </div>
                      <button style={{ ...S.btn('#38bdf8'), width: '100%', justifyContent: 'center' }} onClick={() => sell(item.id)}>
                        <ShoppingCart size={15} /> Sell 1 Unit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── ALERTS ── */}
          {tab === 'Alerts' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ margin: 0, color: '#38bdf8' }}>🤖 AI-Generated Alerts</h2>
                <button style={S.btn('#38bdf8')} onClick={loadAlerts} disabled={alertsLoading}>
                  <RefreshCw size={15} /> {alertsLoading ? 'Analyzing...' : 'Run AI Analysis'}
                </button>
              </div>

              {alertsLoading && <div style={{ textAlign: 'center', padding: '40px', color: '#38bdf8' }}>AI is analyzing your inventory...</div>}

              {!alertsLoading && alerts.length === 0 && (
                <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Click "Run AI Analysis" to check your inventory for issues.
                </div>
              )}

              {alerts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '30px' }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{ ...S.card, borderLeft: `4px solid ${priorityColor[a.priority] || '#38bdf8'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#f1f5f9' }}>{a.name}</strong>
                        <span style={S.badge(priorityColor[a.priority] || '#38bdf8')}>{a.priority}</span>
                      </div>
                      <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '14px' }}>{a.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {waMessages.length > 0 && (
                <>
                  <h3 style={{ color: '#25D366', marginBottom: '16px' }}>📱 WhatsApp Supplier Messages</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {waMessages.map((m, i) => (
                      <div key={i} style={S.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                          <strong style={{ color: '#f1f5f9' }}>To: {m.provider}</strong>
                          <a href={whatsappLink(supplierPhone, m.message)} target="_blank" rel="noreferrer"
                            style={{ ...S.btn('#25D366'), textDecoration: 'none' }}>
                            <Send size={14} /> Send via WhatsApp
                          </a>
                        </div>
                        <div style={{ background: '#0a0f1e', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
                          {m.message}
                        </div>
                        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {m.medicines.map((med, j) => <span key={j} style={S.badge('#38bdf8')}>{med}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── PREDICTIONS ── */}
          {tab === 'Predictions' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ margin: 0, color: '#38bdf8' }}>📊 AI Sales Predictions</h2>
                <button style={S.btn('#38bdf8')} onClick={loadPredictions} disabled={predLoading}>
                  <TrendingUp size={15} /> {predLoading ? 'Predicting...' : 'Generate Predictions'}
                </button>
              </div>

              {predLoading && <div style={{ textAlign: 'center', padding: '40px', color: '#38bdf8' }}>AI is generating predictions...</div>}

              {predSummary && (
                <div style={{ ...S.card, marginBottom: '24px', borderLeft: '4px solid #38bdf8' }}>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', lineHeight: 1.7 }}>{predSummary}</p>
                </div>
              )}

              {predictions.length > 0 && (
                <div style={S.grid}>
                  {predictions.map((p, i) => (
                    <div key={i} style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '15px' }}>{p.name}</h3>
                        <span style={{ fontSize: '20px' }}>{trendIcon[p.trend] || '➡️'}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 2 }}>
                        <div>Current Stock: <strong style={{ color: '#f1f5f9' }}>{p.current_stock}</strong></div>
                        <div>Days Until Empty: <strong style={{ color: p.predicted_days_until_empty < 14 ? '#ef4444' : '#f59e0b' }}>{p.predicted_days_until_empty}d</strong></div>
                        <div>Recommended Order: <strong style={{ color: '#38bdf8' }}>{p.recommended_order_qty} units</strong></div>
                        <div>Trend: <span style={S.badge(p.trend === 'increasing' ? '#22c55e' : p.trend === 'decreasing' ? '#ef4444' : '#38bdf8')}>{p.trend}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!predLoading && predictions.length === 0 && (
                <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Click "Generate Predictions" to get AI-powered sales forecasts.
                </div>
              )}
            </>
          )}

          {/* ── AI CHAT ── */}
          {tab === 'AI Chat' && (
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <h2 style={{ color: '#38bdf8', marginBottom: '20px' }}>💬 AI Pharmacy Assistant</h2>
              <div ref={chatRef} style={{ ...S.card, height: '450px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                {chat.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%', padding: '12px 16px',
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: m.role === 'user' ? '#38bdf8' : '#1e3a5f',
                      color: m.role === 'user' ? '#0a0f1e' : '#e2e8f0',
                      fontSize: '14px', lineHeight: 1.6
                    }}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: '#1e3a5f', color: '#38bdf8', fontSize: '14px' }}>
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  placeholder="Ask about stock, expiry dates, predictions..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                />
                <button style={S.btn('#38bdf8')} onClick={sendChat} disabled={chatLoading}>
                  <MessageCircle size={16} /> Send
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {showAdd && (
          <div style={S.modal} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
            <div style={S.modalBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#38bdf8' }}>{editItem ? 'Edit Medicine' : 'Add Medicine'}</h3>
                <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(['name', 'stock', 'expiry', 'provider', 'min_stock', 'unit_price'] as const).map(field => (
                  <div key={field}>
                    <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block', textTransform: 'capitalize' }}>
                      {field.replace('_', ' ')}
                    </label>
                    <input
                      style={S.input}
                      type={field === 'expiry' ? 'date' : ['stock', 'min_stock', 'unit_price'].includes(field) ? 'number' : 'text'}
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={field.replace('_', ' ')}
                    />
                  </div>
                ))}
                <button style={{ ...S.btn('#38bdf8'), justifyContent: 'center', marginTop: '8px' }} onClick={submitForm}>
                  <Check size={16} /> {editItem ? 'Save Changes' : 'Add Medicine'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}