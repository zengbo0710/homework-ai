import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../lib/api';
import { PurchaseModal } from './PurchaseModal';

export function AppShell() {
  const { logout } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    apiClient.get('/tokens/balance').then((res) => setBalance(res.data.balance)).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">HomeworkAI</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalOpen(true)}
            className="text-sm opacity-90 hover:opacity-100"
          >
            Tokens: {balance ?? '–'}
          </button>
          <button onClick={logout} className="text-xs opacity-75 hover:opacity-100">
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      <PurchaseModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
