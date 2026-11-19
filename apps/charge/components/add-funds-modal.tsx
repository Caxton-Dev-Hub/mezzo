'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { fundWallet } from '@/lib/api-client';

interface AddFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddFundsModal({ isOpen, onClose }: AddFundsModalProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const fundMutation = useMutation({
    mutationFn: fundWallet,
    onSuccess: (data) => {
      // Redirect to Flutterwave checkout
      window.location.href = data.authorizationUrl;
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to initiate payment. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amountNum = parseFloat(amount);

    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amountNum < 100) {
      setError('Minimum funding amount is ₦100');
      return;
    }

    if (amountNum > 100000) {
      setError('Maximum funding amount is ₦100,000');
      return;
    }

    // Convert to kobo (multiply by 100)
    const amountKobo = Math.round(amountNum * 100);

    fundMutation.mutate({ amountKobo });
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setAmount(value);
      setError('');
    }
  };

  const quickAmounts = [500, 1000, 2000, 5000];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-float max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-line">
          <h2 className="text-2xl font-display">Add Funds</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ink rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label htmlFor="amount" className="block text-sm font-medium mb-2">
              Amount (₦)
            </label>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent text-2xl font-display tabular"
              disabled={fundMutation.isPending}
              autoFocus
            />
            <p className="text-sm text-mute mt-2">Minimum: ₦100 • Maximum: ₦100,000</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-seller/10 border border-seller/20 rounded-lg text-sm text-seller">
              {error}
            </div>
          )}

          <div className="mb-6">
            <p className="text-sm font-medium mb-3">Quick amounts</p>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((quickAmount) => (
                <button
                  key={quickAmount}
                  type="button"
                  onClick={() => setAmount(quickAmount.toString())}
                  className="px-3 py-2 bg-ink border border-line rounded-lg hover:bg-surface-2 hover:border-mint transition-colors text-sm font-medium"
                  disabled={fundMutation.isPending}
                >
                  ₦{quickAmount.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-line rounded-lg hover:bg-ink transition-colors font-medium"
              disabled={fundMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!amount || fundMutation.isPending}
              className="flex-1 px-6 py-3 bg-mint text-white rounded-lg hover:bg-mint-deep transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fundMutation.isPending ? 'Processing...' : 'Continue to Payment'}
            </button>
          </div>
        </form>

        <div className="px-6 py-4 bg-surface-2 border-t border-line">
          <p className="text-sm text-fog">
            You&apos;ll be redirected to Flutterwave to complete your payment securely. Your wallet will
            be credited automatically upon successful payment.
          </p>
        </div>
      </div>
    </div>
  );
}
