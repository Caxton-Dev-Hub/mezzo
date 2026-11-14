'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, Plus } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { RentalCard } from '@/components/rental-card';
import { getRentals } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';

function DashboardContent() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['rentals'],
    queryFn: getRentals,
  });

  const activeRental = data?.rentals.find((r) => r.status === 'ACTIVE' || r.status === 'OVERDUE');
  const recentRentals = data?.rentals.filter((r) => r.status === 'RETURNED').slice(0, 5) || [];

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display mb-2">Dashboard</h1>
          <p className="text-fog">Welcome back, {user?.email}</p>
        </div>

        {!user?.isVerified && (
          <div className="mb-8 bg-seller/10 border border-seller/20 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-seller mt-0.5" />
              <div>
                <h3 className="font-medium text-seller mb-1">Verification Required</h3>
                <p className="text-sm text-fog mb-3">
                  You need to complete identity verification before you can rent powerbanks.
                </p>
                <Link
                  href="/verify"
                  className="inline-block px-4 py-2 text-sm font-medium bg-seller text-white rounded-lg hover:bg-seller-deep transition-colors"
                >
                  Complete Verification
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <h2 className="text-2xl font-display mb-4">Active Rental</h2>
              {isLoading ? (
                <div className="bg-surface rounded-xl p-8 text-center text-fog shadow-card">
                  Loading...
                </div>
              ) : activeRental ? (
                <RentalCard rental={activeRental} />
              ) : (
                <div className="bg-surface rounded-xl p-8 text-center shadow-card">
                  <p className="text-fog mb-4">You don&apos;t have any active rentals</p>
                  <p className="text-sm text-mute">
                    Visit any of our partner shops to start a rental
                  </p>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-2xl font-display mb-4">Recent Rentals</h2>
              {recentRentals.length > 0 ? (
                <div className="space-y-4">
                  {recentRentals.map((rental) => (
                    <RentalCard key={rental.id} rental={rental} />
                  ))}
                </div>
              ) : (
                <div className="bg-surface rounded-xl p-8 text-center text-fog shadow-card">
                  No rental history yet
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <div className="bg-surface rounded-xl p-6 shadow-card">
              <h3 className="font-medium mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Link
                  href="/wallet"
                  className="block w-full px-4 py-3 text-center bg-mint text-white font-medium rounded-lg hover:bg-mint-deep transition-colors"
                >
                  <Plus className="w-4 h-4 inline-block mr-2" />
                  Add Funds
                </Link>
                {!user?.isVerified && (
                  <Link
                    href="/verify"
                    className="block w-full px-4 py-3 text-center border border-line font-medium rounded-lg hover:bg-ink transition-colors"
                  >
                    Verify Identity
                  </Link>
                )}
              </div>
            </div>

            <div className="bg-surface-2 rounded-xl p-6 shadow-card">
              <h3 className="font-medium mb-2">Pricing</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fog">Base rate (24h)</span>
                  <span className="font-medium tabular">₦600</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fog">Overdue (per hour)</span>
                  <span className="font-medium tabular">₦25</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fog">Maximum charge</span>
                  <span className="font-medium tabular">₦1,200</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
