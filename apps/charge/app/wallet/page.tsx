'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { AddFundsModal } from '@/components/add-funds-modal';
import { getWalletBalance } from '@/lib/api-client';
import { Plus } from 'lucide-react';

function WalletContent() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: walletData, isLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: getWalletBalance,
  });

  const balance = walletData?.available 
    ? parseFloat(walletData.available.amount) / 100 
    : 0;

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display mb-2">Wallet</h1>
          <p className="text-fog">Manage your wallet balance and transactions</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-mint to-mint-deep rounded-2xl p-8 text-white shadow-float">
              <p className="text-sm opacity-90 mb-2">Available Balance</p>
              <p className="text-5xl font-display mb-6 tabular">
                {isLoading ? '...' : `₦${balance.toLocaleString()}`}
              </p>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="px-6 py-3 bg-white text-mint font-medium rounded-lg hover:bg-ink transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Funds
              </button>
            </div>

            <div className="bg-surface rounded-2xl p-8 shadow-card">
              <h2 className="text-2xl font-display mb-6">Transaction History</h2>
              <div className="text-center py-12 text-fog">
                <p>No transactions yet</p>
                <p className="text-sm text-mute mt-2">
                  Your rental charges and wallet top-ups will appear here
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface-2 rounded-xl p-6 shadow-card">
              <h3 className="font-medium mb-4">How It Works</h3>
              <ol className="space-y-3 text-sm text-fog">
                <li className="flex gap-3">
                  <span className="font-medium text-vellum">1.</span>
                  <span>Add funds to your wallet</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-medium text-vellum">2.</span>
                  <span>Rental charges are deducted automatically</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-medium text-vellum">3.</span>
                  <span>Overdue fees are billed from your wallet</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-medium text-vellum">4.</span>
                  <span>Maintain balance to avoid rental blocks</span>
                </li>
              </ol>
            </div>

            <div className="bg-surface rounded-xl p-6 shadow-card">
              <h3 className="font-medium mb-2">Payment Methods</h3>
              <p className="text-sm text-fog">
                We accept all major payment methods through Flutterwave: cards, bank transfers, and
                mobile money.
              </p>
            </div>
          </div>
        </div>
      </main>
      
      <AddFundsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

export default function WalletPage() {
  return (
    <AuthGuard>
      <WalletContent />
    </AuthGuard>
  );
}
