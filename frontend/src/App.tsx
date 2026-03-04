import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  AlertTriangle, ShoppingCart, Activity, Plus, Trash2,
  Edit3, MessageCircle, TrendingUp, Bell, X, Check, Send, RefreshCw,
  LogOut, Users, Lock, Eye, EyeOff, Shield
} from 'lucide-react';

const API = 'http://localhost:8000';

interface Medicine {
  id: number; name: string; stock: number; expiry: string; provider: string;
  min_stock: number; unit_price: number; is_expiring_soon: boolean;
  is_expired: boolean; needs_restock: boolean;
}
interface Alert { id: number; name: string; message: string; priority: string; }
interface WAMessage { provider: string; message: string; medicines: string[]; }
interface Prediction { name: string; current_stock: any; predicted_days_until_empty: any; recommended_order_qty: any; trend: any; }
interface ChatMsg { role: 'user' | 'ai'; text: string; }
interface UserInfo { username: string; role: string; }
interface AppUser { id: number; username: string; role: string; }

const TABS_ADMIN = ['Inventory', 'Alerts', 'Predictions', 'AI Chat', 'Users'] as const;
const TABS_STAFF = ['Inventory', 'AI Chat'] as const;
type Tab = 'Inventory' | 'Alerts' | 'Predictions' | 'AI Chat' | 'Users';

const priorityColor: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };

const toStr = (val: any): string => {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const api = axios.create({ baseURL: API });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

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
  const [chat, setChat] = useState<ChatMsg[]>([{ role: 'ai', text: "Hi! I'm your pharmacy AI assistant. Ask me anything about your inventory." }]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'staff' });
  const [form, setForm] = useState({ name: '', stock: '', expiry: '', provider: '', min_stock: '20', unit_price: '10' });
  const chatRef = useRef<HTMLDivElement>(null);

  // Check for existing token on load
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) loadInventory(); }, [user]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [chat]);

  const login = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const form = new FormData();
      form.append('username', loginForm.username);
      form.append('password', loginForm.password);
      const res = await axios.post(`${API}/auth/login`, form);
      localStorage.setItem('token', res.data.access_token);
      const userInfo = { username: res.data.username, role: res.data.role };
      localStorage.setItem('user', JSON.stringify(userInfo));
      setUser(userInfo);
    } catch (e) {
      setLoginError('Incorrect username or password');
    }
    setLoginLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setItems([]);
  };

  const loadInventory = async () => {
    try {
      const res = await api.get('/inventory');
      setItems(res.data);
    } catch (e) { console.error(e); }
  };

  const sell = async (id: number) => {
    await api.post('/sell', { item_id: id, quantity: 1 });
    loadInventory();
  };

  const deleteItem = async (id: number) => {
    if (!window.confirm('Delete this medicine?')) return;
    await api.delete(`/inventory/${id}`);
    loadInventory();
  };

  const submitForm = async () => {
    const payload = { name: form.name, stock: Number(form.stock), expiry: form.expiry, provider: form.provider, min_stock: Number(form.min_stock), unit_price: Number(form.unit_price) };
    if (editItem) { await api.put(`/inventory/${editItem.id}`, payload); }
    else { await api.post('/inventory', payload); }
    setShowAdd(false); setEditItem(null);
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
      const res = await api.get('/ai/alerts');
      setAlerts(res.data.alerts || []);
      setWaMessages(res.data.whatsapp_messages || []);
      setSupplierPhone(res.data.supplier_whatsapp || '');
    } catch (e) { console.error(e); }
    setAlertsLoading(false);
  };

  const loadPredictions = async () => {
    setPredLoading(true);
    try {
      const res = await api.get('/ai/predictions');
      setPredictions(res.data.predictions || []);
      setPredSummary(toStr(res.data.summary));
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
      const res = await api.post('/ai/chat', { message: msg });
      setChat(c => [...c, { role: 'ai', text: toStr(res.data.response) }]);
    } catch (e) {
      setChat(c => [...c, { role: 'ai', text: 'Could not connect to AI.' }]);
    }
    setChatLoading(false);
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      setAppUsers(res.data);
    } catch (e) { console.error(e); }
  };

  const createUser = async () => {
    try {
      await api.post('/auth/users', newUser);
      setNewUser({ username: '', password: '', role: 'staff' });
      loadUsers();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error creating user');
    }
  };

  const deleteUser = async (id: number) => {
    if (!window.confirm('Delete this user?')) return;
    await api.delete(`/auth/users/${id}`);
    loadUsers();
  };

  useEffect(() => { if (tab === 'Users' && user?.role === 'admin') loadUsers(); }, [tab]);

  const whatsappLink = (phone: string, message: string) =>
    `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const tabs = user?.role === 'admin' ? TABS_ADMIN : TABS_STAFF;

  const S: Record<string, React.CSSProperties> = {
    app: { minHeight: '100vh', backgroundColor: '#0a0f1e', fontFamily: "'Syne', sans-serif", color: '#e2e8f0' },
    header: { background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 100%)', borderBottom: '1px solid #1e3a5f', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
    logo: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '20px', fontWeight: 800, color: '#38bdf8' },
    tabs: { display: 'flex', gap: '4px', background: '#0d1b3e', padding: '4px', borderRadius: '12px', border: '1px solid #1e3a5f' },
    tab: (active: boolean): React.CSSProperties => ({ padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: "'Syne', sans-serif", background: active ? '#38bdf8' : 'transparent', color: active ? '#0a0f1e' : '#94a3b8', transition: 'all 0.2s' }),
    body: { padding: '30px 40px' },
    card: { background: 'linear-gradient(135deg, #0d1b3e 0%, #0f2347 100%)', border: '1px solid #1e3a5f', borderRadius: '16px', padding: '22px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' },
    badge: (color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: color + '22', color: color }),
    btn: (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: "'Syne', sans-serif", background: color, color: '#fff', transition: 'opacity 0.2s' }),
    input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e3a5f', background: '#0a0f1e', color: '#e2e8f0', fontSize: '14px', fontFamily: "'Syne', sans-serif", boxSizing: 'border-box' as const },
    modal: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modalBox: { background: '#0d1b3e', border: '1px solid #1e3a5f', borderRadius: '20px', padding: '30px', width: '420px', maxWidth: '90vw' },
  };

  // ── LOGIN SCREEN ──────────────────────────────────────
  if (!user) {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ ...S.app, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.modalBox, width: '380px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <div style={{ background: '#38bdf822', borderRadius: '50%', padding: '16px' }}>
                  <Activity size={36} color="#38bdf8" />
                </div>
              </div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#38bdf8' }}>PharmAI</h1>
              <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '14px' }}>Sign in to your account</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Username</label>
                <input
                  style={S.input}
                  placeholder="Enter username"
                  value={loginForm.username}
                  onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && login()}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...S.input, paddingRight: '44px' }}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={loginForm.password}
                    onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && login()}
                  />
                  <button
                    onClick={() => setShowPassword(s => !s)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div style={{ background: '#ef444422', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#ef4444' }}>
                  {loginError}
                </div>
              )}

              <button style={{ ...S.btn('#38bdf8'), justifyContent: 'center', padding: '12px', marginTop: '4px' }} onClick={login} disabled={loginLoading}>
                {loginLoading ? 'Signing in...' : <><Lock size={15} /> Sign In</>}
              </button>
            </div>

            <div style={{ marginTop: '20px', padding: '14px', background: '#0a0f1e', borderRadius: '10px', fontSize: '12px', color: '#64748b' }}>
              <div style={{ marginBottom: '4px' }}><strong style={{ color: '#38bdf8' }}>Admin:</strong> admin / admin123</div>
              <div><strong style={{ color: '#94a3b8' }}>Staff:</strong> staff / staff123</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── MAIN APP ──────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={S.app}>
        <header style={S.header}>
          <div style={S.logo}>
            <Activity size={26} color="#38bdf8" />
            PharmAI Dashboard
          </div>
          <div style={S.tabs}>
            {tabs.map(t => (
              <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t as Tab)}>{t}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={S.badge('#ef4444')}>
              <Bell size={12} /> {items.filter(i => i.needs_restock || i.is_expiring_soon).length}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={S.badge(user.role === 'admin' ? '#38bdf8' : '#94a3b8')}>
                <Shield size={11} /> {user.role}
              </div>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>{user.username}</span>
            </div>
            <button onClick={logout} style={{ ...S.btn('#ef444433'), color: '#ef4444', padding: '6px 12px' }}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </header>

        <div style={S.body}>

          {/* ── INVENTORY ── */}
          {tab === 'Inventory' && (
            <>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <input style={{ ...S.input, flex: 1, minWidth: '200px' }} placeholder="🔍 Search medicines..." value={search} onChange={e => setSearch(e.target.value)} />
                {user.role === 'admin' && (
                  <button style={S.btn('#38bdf8')} onClick={() => { setEditItem(null); setForm({ name: '', stock: '', expiry: '', provider: '', min_stock: '20', unit_price: '10' }); setShowAdd(true); }}>
                    <Plus size={16} /> Add Medicine
                  </button>
                )}
                <button style={S.btn('#1e3a5f')} onClick={loadInventory}><RefreshCw size={16} /></button>
              </div>
              <div style={S.grid}>
                {filtered.map(item => (
                  <div key={item.id} style={{ ...S.card, borderLeft: `3px solid ${item.needs_restock || item.is_expired ? '#ef4444' : item.is_expiring_soon ? '#f59e0b' : '#22c55e'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>{item.name}</h3>
                      {user.role === 'admin' && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => openEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#38bdf8' }}><Edit3 size={15} /></button>
                          <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
                        </div>
                      )}
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
            </>
          )}

          {/* ── ALERTS (admin only) ── */}
          {tab === 'Alerts' && user.role === 'admin' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ margin: 0, color: '#38bdf8' }}>🤖 AI-Generated Alerts</h2>
                <button style={S.btn('#38bdf8')} onClick={loadAlerts} disabled={alertsLoading}>
                  <RefreshCw size={15} /> {alertsLoading ? 'Analyzing...' : 'Run AI Analysis'}
                </button>
              </div>
              {alertsLoading && <div style={{ textAlign: 'center', padding: '40px', color: '#38bdf8' }}>AI is analyzing your inventory...</div>}
              {!alertsLoading && alerts.length === 0 && (
                <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Click "Run AI Analysis" to check your inventory.</div>
              )}
              {alerts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '30px' }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{ ...S.card, borderLeft: `4px solid ${priorityColor[a.priority] || '#38bdf8'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#f1f5f9' }}>{toStr(a.name)}</strong>
                        <span style={S.badge(priorityColor[a.priority] || '#38bdf8')}>{toStr(a.priority)}</span>
                      </div>
                      <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '14px' }}>{toStr(a.message)}</p>
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
                          <strong style={{ color: '#f1f5f9' }}>To: {toStr(m.provider)}</strong>
                          <a href={whatsappLink(supplierPhone, toStr(m.message))} target="_blank" rel="noreferrer" style={{ ...S.btn('#25D366'), textDecoration: 'none' }}>
                            <Send size={14} /> Send via WhatsApp
                          </a>
                        </div>
                        <div style={{ background: '#0a0f1e', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>{toStr(m.message)}</div>
                        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {(m.medicines || []).map((med, j) => <span key={j} style={S.badge('#38bdf8')}>{toStr(med)}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── PREDICTIONS (admin only) ── */}
          {tab === 'Predictions' && user.role === 'admin' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ margin: 0, color: '#38bdf8' }}>📊 AI Sales Predictions</h2>
                <button style={S.btn('#38bdf8')} onClick={loadPredictions} disabled={predLoading}>
                  <TrendingUp size={15} /> {predLoading ? 'Predicting...' : 'Generate Predictions'}
                </button>
              </div>
              {predLoading && <div style={{ textAlign: 'center', padding: '40px', color: '#38bdf8' }}>Generating predictions...</div>}
              {predSummary && <div style={{ ...S.card, marginBottom: '24px', borderLeft: '4px solid #38bdf8' }}><p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', lineHeight: 1.7 }}>{predSummary}</p></div>}
              {predictions.length > 0 && (
                <div style={S.grid}>
                  {predictions.map((p, i) => (
                    <div key={i} style={S.card}>
                      <h3 style={{ margin: '0 0 12px', color: '#f1f5f9', fontSize: '15px' }}>{toStr(p.name)}</h3>
                      <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 2 }}>
                        <div>Current Stock: <strong style={{ color: '#f1f5f9' }}>{toStr(p.current_stock)}</strong></div>
                        <div>Days Until Empty: <strong style={{ color: '#f59e0b' }}>{toStr(p.predicted_days_until_empty)}</strong></div>
                        <div>Recommended Order: <strong style={{ color: '#38bdf8' }}>{toStr(p.recommended_order_qty)}</strong></div>
                        <div>Trend: <span style={S.badge('#38bdf8')}>{toStr(p.trend)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!predLoading && predictions.length === 0 && (
                <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Click "Generate Predictions" to get AI forecasts.</div>
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
                    <div style={{ maxWidth: '80%', padding: '12px 16px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: m.role === 'user' ? '#38bdf8' : '#1e3a5f', color: m.role === 'user' ? '#0a0f1e' : '#e2e8f0', fontSize: '14px', lineHeight: 1.6 }}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: '#1e3a5f', color: '#38bdf8', fontSize: '14px' }}>Thinking...</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Ask about stock, expiry, predictions..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} />
                <button style={S.btn('#38bdf8')} onClick={sendChat} disabled={chatLoading}><MessageCircle size={16} /> Send</button>
              </div>
            </div>
          )}

          {/* ── USERS (admin only) ── */}
          {tab === 'Users' && user.role === 'admin' && (
            <>
              <h2 style={{ margin: '0 0 24px', color: '#38bdf8' }}>👥 User Management</h2>
              <div style={{ ...S.card, marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 16px', color: '#f1f5f9', fontSize: '15px' }}>Add New User</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <input style={{ ...S.input, flex: 1, minWidth: '140px' }} placeholder="Username" value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
                  <input style={{ ...S.input, flex: 1, minWidth: '140px' }} type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
                  <select style={{ ...S.input, width: 'auto' }} value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button style={S.btn('#38bdf8')} onClick={createUser}><Plus size={15} /> Add User</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {appUsers.map(u => (
                  <div key={u.id} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Users size={18} color="#38bdf8" />
                      <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{u.username}</span>
                      <span style={S.badge(u.role === 'admin' ? '#38bdf8' : '#94a3b8')}><Shield size={10} /> {u.role}</span>
                    </div>
                    <button onClick={() => deleteUser(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </>
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
                    <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block', textTransform: 'capitalize' }}>{field.replace('_', ' ')}</label>
                    <input style={S.input} type={field === 'expiry' ? 'date' : ['stock', 'min_stock', 'unit_price'].includes(field) ? 'number' : 'text'} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={field.replace('_', ' ')} />
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