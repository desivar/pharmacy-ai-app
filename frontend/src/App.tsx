// Define the shape of our data coming from the Backend
interface Medicine {
  id: number;
  name: string;
  stock: number;
  expiry: string;
  provider: string;
  is_expiring_soon: boolean;
  needs_restock: boolean;
}



import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, ShoppingCart, Activity } from 'lucide-react';

const App: React.FC = () => {
  // TypeScript ensures 'items' is always a list of Medicines
  const [items, setItems] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async (): Promise<void> => {
    try {
      const res = await axios.get('/api/inventory')
      setItems(res.data);
      setLoading(false);
    } catch (err) {
      console.error("Connection to Pharmacy API failed", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const sellItem = async (id: number): Promise<void> => {
    await axios.post('http://127.0.0.1:8000/sell', { item_id: id, quantity: 1 });
    loadData(); // Refresh the Record of Existence
  };

  if (loading) return <div style={{ padding: '50px' }}>Syncing with Pharmacy Vault...</div>;

  return (
    <div style={{ padding: '40px', backgroundColor: '#f1f5f9', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ marginBottom: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '20px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#0f172a' }}>
          <Activity color="#2563eb" /> Pharmacy AI Dashboard (TS)
        </h1>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {items.map((item) => (
          <div key={item.id} style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            borderLeft: item.is_expiring_soon ? '6px solid #f59e0b' : '6px solid #10b981'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{item.name}</h2>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Provider: {item.provider}</span>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.95rem' }}>
                Expires: <strong>{item.expiry}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
              {item.is_expiring_soon && (
                <div style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                  <AlertTriangle size={20} /> 5-Month Rule Triggered
                </div>
              )}

              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <div style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold', 
                  color: item.needs_restock ? '#dc2626' : '#1e293b' 
                }}>
                  {item.stock} Units
                </div>
                <button 
                  onClick={() => sellItem(item.id)}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#0f172a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <ShoppingCart size={16} /> Sell
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;