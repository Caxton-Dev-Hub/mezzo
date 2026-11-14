'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { PowerbankStatus } from '@/components/powerbank-status';
import {
  getVerifications,
  approveVerification,
  rejectVerification,
  getRentals,
} from '@/lib/api-client';
import { Check, X } from 'lucide-react';

type Tab = 'verifications' | 'overdue' | 'unreturned' | 'revenue';

function AdminContent() {
  const [activeTab, setActiveTab] = useState<Tab>('verifications');
  const queryClient = useQueryClient();

  const { data: verificationsData } = useQuery({
    queryKey: ['verifications', 'PENDING'],
    queryFn: () => getVerifications('PENDING'),
    enabled: activeTab === 'verifications',
  });

  const { data: rentalsData } = useQuery({
    queryKey: ['rentals'],
    queryFn: getRentals,
    enabled: activeTab === 'overdue' || activeTab === 'unreturned',
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveVerification(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectVerification(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });

  const overdueRentals = rentalsData?.rentals.filter((r) => r.status === 'OVERDUE') || [];
  const unreturnedRentals = rentalsData?.rentals.filter((r) => r.status === 'UNRETURNED') || [];

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display mb-2">Admin Portal</h1>
          <p className="text-fog">Manage verifications, rentals, and system oversight</p>
        </div>

        <div className="border-b border-line mb-8">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('verifications')}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'verifications'
                  ? 'border-mint text-mint'
                  : 'border-transparent text-fog hover:text-vellum'
              }`}
            >
              Verifications
            </button>
            <button
              onClick={() => setActiveTab('overdue')}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'overdue'
                  ? 'border-mint text-mint'
                  : 'border-transparent text-fog hover:text-vellum'
              }`}
            >
              Overdue
            </button>
            <button
              onClick={() => setActiveTab('unreturned')}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'unreturned'
                  ? 'border-mint text-mint'
                  : 'border-transparent text-fog hover:text-vellum'
              }`}
            >
              Unreturned
            </button>
            <button
              onClick={() => setActiveTab('revenue')}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'revenue'
                  ? 'border-mint text-mint'
                  : 'border-transparent text-fog hover:text-vellum'
              }`}
            >
              Revenue
            </button>
          </div>
        </div>

        {activeTab === 'verifications' && (
          <div>
            <h2 className="text-2xl font-display mb-6">Pending Verifications</h2>
            {verificationsData && verificationsData.length > 0 ? (
              <div className="space-y-4">
                {verificationsData.map((verification) => (
                  <div key={verification.id} className="bg-surface rounded-xl p-6 shadow-card">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-lg mb-2">{verification.fullName}</h3>
                        <div className="space-y-1 text-sm text-fog">
                          <p>Phone: {verification.phoneNumber}</p>
                          <p>User ID: {verification.userId.slice(0, 8)}</p>
                          <p>
                            Submitted: {new Date(verification.submittedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate(verification.id)}
                          disabled={approveMutation.isPending}
                          className="px-4 py-2 bg-mint text-white rounded-lg hover:bg-mint-deep disabled:opacity-50 transition-colors flex items-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(verification.id)}
                          disabled={rejectMutation.isPending}
                          className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-danger-deep disabled:opacity-50 transition-colors flex items-center gap-2"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface rounded-xl p-12 text-center text-fog shadow-card">
                No pending verifications
              </div>
            )}
          </div>
        )}

        {activeTab === 'overdue' && (
          <div>
            <h2 className="text-2xl font-display mb-6">Overdue Rentals</h2>
            {overdueRentals.length > 0 ? (
              <div className="space-y-4">
                {overdueRentals.map((rental) => (
                  <div key={rental.id} className="bg-surface rounded-xl p-6 shadow-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium">Powerbank {rental.powerbankId.slice(0, 8)}</h3>
                          <PowerbankStatus status={rental.status} />
                        </div>
                        <div className="space-y-1 text-sm text-fog">
                          <p>Customer: {rental.userId.slice(0, 8)}</p>
                          <p>Shop: {rental.shopId.slice(0, 8)}</p>
                          <p>Due: {new Date(rental.dueAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-medium tabular">
                          {rental.totalChargedCurrency} {rental.totalChargedAmount}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface rounded-xl p-12 text-center text-fog shadow-card">
                No overdue rentals
              </div>
            )}
          </div>
        )}

        {activeTab === 'unreturned' && (
          <div>
            <h2 className="text-2xl font-display mb-6">Unreturned Rentals</h2>
            {unreturnedRentals.length > 0 ? (
              <div className="space-y-4">
                {unreturnedRentals.map((rental) => (
                  <div key={rental.id} className="bg-surface rounded-xl p-6 shadow-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium">Powerbank {rental.powerbankId.slice(0, 8)}</h3>
                          <PowerbankStatus status={rental.status} />
                        </div>
                        <div className="space-y-1 text-sm text-fog">
                          <p>Customer: {rental.userId.slice(0, 8)}</p>
                          <p>Shop: {rental.shopId.slice(0, 8)}</p>
                          <p>Started: {new Date(rental.startedAt).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface rounded-xl p-12 text-center text-fog shadow-card">
                No unreturned rentals
              </div>
            )}
          </div>
        )}

        {activeTab === 'revenue' && (
          <div>
            <h2 className="text-2xl font-display mb-6">Revenue Overview</h2>
            <div className="bg-surface rounded-xl p-12 text-center text-fog shadow-card">
              Revenue reporting coming soon
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AuthGuard requireAdmin>
      <AdminContent />
    </AuthGuard>
  );
}
