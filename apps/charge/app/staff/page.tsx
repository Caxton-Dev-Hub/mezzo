'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { StaffCheckoutForm } from '@/components/staff-checkout-form';
import { AccessoryForm } from '@/components/accessory-form';
import { RentalCard } from '@/components/rental-card';
import { getRentals } from '@/lib/api-client';

type Tab = 'checkout' | 'sales' | 'rentals';

function StaffContent() {
  const [activeTab, setActiveTab] = useState<Tab>('checkout');

  const { data: rentalsData } = useQuery({
    queryKey: ['rentals'],
    queryFn: getRentals,
    enabled: activeTab === 'rentals',
  });

  const activeRentals =
    rentalsData?.rentals.filter((r) => r.status === 'ACTIVE' || r.status === 'OVERDUE') || [];

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display mb-2">Staff Portal</h1>
          <p className="text-fog">Manage checkouts, sales, and rentals</p>
        </div>

        <div className="border-b border-line mb-8">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('checkout')}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'checkout'
                  ? 'border-mint text-mint'
                  : 'border-transparent text-fog hover:text-vellum'
              }`}
            >
              Checkout
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'sales'
                  ? 'border-mint text-mint'
                  : 'border-transparent text-fog hover:text-vellum'
              }`}
            >
              Sales
            </button>
            <button
              onClick={() => setActiveTab('rentals')}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'rentals'
                  ? 'border-mint text-mint'
                  : 'border-transparent text-fog hover:text-vellum'
              }`}
            >
              Rentals
            </button>
          </div>
        </div>

        {activeTab === 'checkout' && (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-display mb-6">Checkout Powerbank</h2>
            <StaffCheckoutForm />
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-display mb-6">Record Sale</h2>
            <AccessoryForm />
          </div>
        )}

        {activeTab === 'rentals' && (
          <div>
            <h2 className="text-2xl font-display mb-6">Active Rentals</h2>
            {activeRentals.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeRentals.map((rental) => (
                  <RentalCard key={rental.id} rental={rental} />
                ))}
              </div>
            ) : (
              <div className="bg-surface rounded-xl p-12 text-center text-fog shadow-card">
                No active rentals
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function StaffPage() {
  return (
    <AuthGuard requireStaff>
      <StaffContent />
    </AuthGuard>
  );
}
