'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { PowerbankStatusBadge } from '@/components/powerbank-status-badge';
import {
  getPowerbanks,
  createPowerbank,
  markPowerbankAvailable,
  markPowerbankMaintenance,
  getShops,
} from '@/lib/api-client';
import { PowerbankStatus } from '@mezzo/shared-types';
import { useAuth } from '@/lib/auth';

const createPowerbankSchema = z.object({
  shopId: z.string().uuid('Please select a shop'),
  number: z.string().min(1, 'Number is required').max(2, 'Number must be 1-99'),
});

type CreatePowerbankFormData = z.infer<typeof createPowerbankSchema>;

function PowerbanksContent() {
  const queryClient = useQueryClient();
  const { isAdmin, isStaff } = useAuth();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: powerbanksData } = useQuery({
    queryKey: ['powerbanks'],
    queryFn: () => getPowerbanks(),
  });

  const { data: shopsData } = useQuery({
    queryKey: ['shops'],
    queryFn: getShops,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePowerbankFormData>({
    resolver: zodResolver(createPowerbankSchema),
  });

  const createMutation = useMutation({
    mutationFn: createPowerbank,
    onSuccess: () => {
      setSuccess('Powerbank created successfully');
      setError(null);
      reset();
      queryClient.invalidateQueries({ queryKey: ['powerbanks'] });
      setTimeout(() => setSuccess(null), 5000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create powerbank');
      setSuccess(null);
    },
  });

  const markAvailableMutation = useMutation({
    mutationFn: markPowerbankAvailable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['powerbanks'] });
      queryClient.invalidateQueries({ queryKey: ['available-powerbanks'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to mark powerbank as available');
    },
  });

  const markMaintenanceMutation = useMutation({
    mutationFn: markPowerbankMaintenance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['powerbanks'] });
      queryClient.invalidateQueries({ queryKey: ['available-powerbanks'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to mark powerbank as maintenance');
    },
  });

  const onSubmit = (data: CreatePowerbankFormData) => {
    createMutation.mutate(data);
  };

  const getShopName = (shopId: string) => {
    const shop = shopsData?.find((s) => s.id === shopId);
    return shop ? `${shop.name} - ${shop.location}` : shopId;
  };

  const canMarkStatus = isStaff || isAdmin;

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display mb-2">Powerbank Management</h1>
          <p className="text-fog">Add and manage powerbank inventory</p>
        </div>

        {isAdmin && (
          <div className="bg-surface rounded-2xl shadow-card p-8 mb-8">
            <h2 className="text-2xl font-display mb-6">Add New Powerbank</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {success && (
                <div className="bg-mint/10 border border-mint/20 rounded-lg p-4 text-sm text-mint">
                  {success}
                </div>
              )}

              {error && (
                <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 text-sm text-danger">
                  {error}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="number" className="block text-sm font-medium mb-2">
                    Powerbank Number (1-99)
                  </label>
                  <input
                    {...register('number')}
                    id="number"
                    type="text"
                    placeholder="e.g., 1, 2, 3"
                    className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
                  />
                  {errors.number && (
                    <p className="mt-2 text-sm text-danger">{errors.number.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="shopId" className="block text-sm font-medium mb-2">
                    Shop
                  </label>
                  <select
                    {...register('shopId')}
                    id="shopId"
                    className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
                  >
                    <option value="">Select a shop</option>
                    {shopsData?.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name} - {shop.location}
                      </option>
                    ))}
                  </select>
                  {errors.shopId && (
                    <p className="mt-2 text-sm text-danger">{errors.shopId.message}</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-mint"
              >
                {isSubmitting ? 'Creating...' : 'Add Powerbank'}
              </button>
            </form>
          </div>
        )}

        <div className="bg-surface rounded-2xl shadow-card overflow-hidden">
          <div className="p-6 border-b border-line">
            <h2 className="text-2xl font-display">All Powerbanks</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-ink/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fog uppercase tracking-wider">
                    Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fog uppercase tracking-wider">
                    Shop
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fog uppercase tracking-wider">
                    Status
                  </th>
                  {canMarkStatus && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-fog uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {powerbanksData?.items.map((powerbank) => (
                  <tr key={powerbank.id} className="hover:bg-ink/20">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      #{powerbank.number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-fog">
                      {getShopName(powerbank.shopId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PowerbankStatusBadge status={powerbank.status} />
                    </td>
                    {canMarkStatus && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        {powerbank.status !== PowerbankStatus.AVAILABLE && (
                          <button
                            onClick={() => markAvailableMutation.mutate(powerbank.id)}
                            disabled={markAvailableMutation.isPending}
                            className="px-3 py-1.5 bg-mint/10 text-mint border border-mint/20 rounded-md hover:bg-mint/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                          >
                            Mark Available
                          </button>
                        )}
                        {powerbank.status !== PowerbankStatus.MAINTENANCE && (
                          <button
                            onClick={() => markMaintenanceMutation.mutate(powerbank.id)}
                            disabled={markMaintenanceMutation.isPending}
                            className="px-3 py-1.5 bg-fog/10 text-fog border border-fog/20 rounded-md hover:bg-fog/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                          >
                            Mark Maintenance
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {(!powerbanksData?.items || powerbanksData.items.length === 0) && (
                  <tr>
                    <td colSpan={canMarkStatus ? 4 : 3} className="px-6 py-12 text-center text-fog">
                      No powerbanks found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PowerbanksPage() {
  return (
    <AuthGuard requireStaff>
      <PowerbanksContent />
    </AuthGuard>
  );
}
