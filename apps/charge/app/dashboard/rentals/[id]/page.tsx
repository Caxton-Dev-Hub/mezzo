'use client';

import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Clock, MapPin, Calendar } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { PowerbankStatus } from '@/components/powerbank-status';
import { ChargeBreakdown } from '@/components/charge-breakdown';
import { getRental, checkin } from '@/lib/api-client';

interface RentalDetailPageProps {
  params: Promise<{ id: string }>;
}

function RentalDetailContent({ rentalId }: { rentalId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: rental, isLoading } = useQuery({
    queryKey: ['rental', rentalId],
    queryFn: () => getRental(rentalId),
  });

  const checkinMutation = useMutation({
    mutationFn: () => checkin(rentalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental', rentalId] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      router.push('/dashboard');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ink">
        <Navbar />
        <main className="max-w-5xl mx-auto px-6 py-12">
          <div className="text-center text-fog">Loading...</div>
        </main>
      </div>
    );
  }

  if (!rental) {
    return (
      <div className="min-h-screen bg-ink">
        <Navbar />
        <main className="max-w-5xl mx-auto px-6 py-12">
          <div className="text-center text-fog">Rental not found</div>
        </main>
      </div>
    );
  }

  const startDate = new Date(rental.startedAt);
  const dueDate = new Date(rental.dueAt);
  const canCheckin = rental.status === 'ACTIVE' || rental.status === 'OVERDUE';

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-display">Rental Details</h1>
            <PowerbankStatus status={rental.status} />
          </div>
          <p className="text-fog">Powerbank {rental.powerbankId.slice(0, 8)}</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface rounded-2xl p-8 shadow-card">
              <h2 className="text-2xl font-display mb-6">Rental Information</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-fog">
                  <MapPin className="w-5 h-5" />
                  <div>
                    <p className="text-sm text-mute">Shop</p>
                    <p className="text-vellum">{rental.shopId.slice(0, 8)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-fog">
                  <Calendar className="w-5 h-5" />
                  <div>
                    <p className="text-sm text-mute">Started</p>
                    <p className="text-vellum">{startDate.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-fog">
                  <Clock className="w-5 h-5" />
                  <div>
                    <p className="text-sm text-mute">Due</p>
                    <p className="text-vellum">{dueDate.toLocaleString()}</p>
                  </div>
                </div>

                {rental.returnedAt && (
                  <div className="flex items-center gap-3 text-fog">
                    <Clock className="w-5 h-5" />
                    <div>
                      <p className="text-sm text-mute">Returned</p>
                      <p className="text-vellum">
                        {new Date(rental.returnedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <ChargeBreakdown
              baseAmount={rental.baseChargeAmount}
              totalAmount={rental.totalChargedAmount}
              currency={rental.totalChargedCurrency}
            />
          </div>

          <div className="space-y-6">
            {canCheckin && (
              <div className="bg-surface rounded-xl p-6 shadow-card">
                <h3 className="font-medium mb-4">Return Powerbank</h3>
                <p className="text-sm text-fog mb-4">
                  Visit any shop to return this powerbank. Staff will process the checkin.
                </p>
                <button
                  onClick={() => checkinMutation.mutate()}
                  disabled={checkinMutation.isPending}
                  className="w-full px-4 py-3 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {checkinMutation.isPending ? 'Processing...' : 'Complete Checkin'}
                </button>
              </div>
            )}

            <div className="bg-surface-2 rounded-xl p-6 shadow-card">
              <h3 className="font-medium mb-2">Need Help?</h3>
              <p className="text-sm text-fog mb-4">
                If you have any issues with this rental, please contact shop staff or visit our
                support page.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function RentalDetailWrapper({ params }: RentalDetailPageProps) {
  const { id } = use(params);
  return <RentalDetailContent rentalId={id} />;
}

export default function RentalDetailPage(props: RentalDetailPageProps) {
  return (
    <AuthGuard>
      <RentalDetailWrapper {...props} />
    </AuthGuard>
  );
}
