import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, ShoppingCart, Activity } from 'lucide-react';

interface Medicine {
  id: number;
  name: string;
  stock: number;
  expiry: string;
  provider: string;
  is_expiring_soon: boolean;
  needs_restock: boolean;
}

const App: React.FC = () => {
  const [items, setItems] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async (): Promise<void> => {
    try {
      const res = await axios.get('http://localhost:8000/inventory');  // Fixed: added URL
      setItems(res.data);
      setLoading(false);
    } catch (err) {
      console.error("Connection failed", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const sellItem = async (id: number): Promise<void> => {
    await axios.post('http://localhost:8000/sell', { item_id: id, quantity: 1 });  // Fixed: added URL
    loadData();
  };

  if (loading) return <div style={{ padding: '50px' }}>Syncing with Pharmacy Vault...</div>;

  return (
    <div style={{ padding: '40px', backgroundColor: '#f1f5f9', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ marginBottom: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '20px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#0f172a' }}>
          <Activity color="#2563eb" /> Pharmacy AI Dashboard (TS)
        </h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {items.map((item) => (
          <div key={item.id} style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            borderLeft: item.needs_restock ? '4px solid #ef4444' : '4px solid #22c55e'
          }}>
            <h2 style={{ margin: '0 0 10px', color: '#0f172a' }}>{item.name}</h2>
            <p style={{ margin: '4px 0', color: '#475569' }}>Stock: <strong>{item.stock}</strong></p>
            <p style={{ margin: '4px 0', color: '#475569' }}>Expiry: <strong>{item.expiry}</strong></p>
            <p style={{ margin: '4px 0', color: '#475569' }}>Provider: <strong>{item.provider}</strong></p>

            {item.is_expiring_soon && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', marginTop: '8px' }}>
                <AlertTriangle size={16} /> Expiring Soon
              </div>
            )}
            {item.needs_restock && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', marginTop: '4px' }}>
                <AlertTriangle size={16} /> Low Stock
              </div>
            )}

            <button
              onClick={() => sellItem(item.id)}
              style={{
                marginTop: '14px',
                width: '100%',
                padding: '10px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <ShoppingCart size={16} /> Sell 1
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;