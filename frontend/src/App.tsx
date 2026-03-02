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

      <div style={{ padding: '20px', backgroundColor: '#ffffff', borderRadius: '8px', marginBottom: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
<h3 style={{ marginTop: 0, color: '#0f172a' }}>Register New Stock</h3>
<div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
<input id="newName" placeholder="Medicine Name" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', flex: '1' }} />
<input id="newStock" type="number" placeholder="Stock" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100px' }} />
<input id="newExpiry" type="date" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
<input id="newProvider" placeholder="Provider" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', flex: '1' }} />
<button
onClick={async () => {
const name = (document.getElementById('newName') as HTMLInputElement).value;
const stock = parseInt((document.getElementById('newStock') as HTMLInputElement).value);
const expiry = (document.getElementById('newExpiry') as HTMLInputElement).value;
const provider = (document.getElementById('newProvider') as HTMLInputElement).value;
if (!name || !stock) return alert('Please enter Name and Stock');
await axios.post('', { name, stock, expiry, provider });
loadData();
}}
style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
>
+ Add to Inventory
</button>
</div>
</div>