import { useEffect, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { apiClient } from '../lib/api';

interface TokenPackage {
  id: string;
  tokens: number;
  priceCents: number;
  currency: string;
}

interface PurchaseModalProps {
  open: boolean;
  onClose(): void;
}

export function PurchaseModal({ open, onClose }: PurchaseModalProps) {
  const [packages, setPackages] = useState<TokenPackage[]>([]);

  useEffect(() => {
    if (open) {
      apiClient.get('/tokens/packages').then((res) => setPackages(res.data)).catch(() => {});
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-end justify-center p-4">
        <Dialog.Panel className="w-full max-w-sm bg-white rounded-t-2xl p-6 space-y-4">
          <Dialog.Title className="text-lg font-bold">Buy Tokens</Dialog.Title>
          {packages.map((pkg) => (
            <div key={pkg.id} className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="font-medium">{pkg.tokens} tokens</p>
                <p className="text-sm text-gray-500">${(pkg.priceCents / 100).toFixed(2)} {pkg.currency}</p>
              </div>
              <button
                disabled
                className="bg-indigo-100 text-indigo-400 text-sm px-4 py-2 rounded-lg cursor-not-allowed"
              >
                Coming Soon
              </button>
            </div>
          ))}
          <button onClick={onClose} className="w-full text-sm text-gray-500 pt-2">Close</button>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
