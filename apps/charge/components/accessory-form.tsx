'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getAccessories, recordSale } from '@/lib/api-client';

const saleSchema = z.object({
  accessoryId: z.string().uuid('Please select an accessory'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
});

type SaleFormData = z.infer<typeof saleSchema>;

export function AccessoryForm() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: accessoriesData } = useQuery({
    queryKey: ['accessories'],
    queryFn: () => getAccessories(),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema),
  });

  const saleMutation = useMutation({
    mutationFn: recordSale,
    onSuccess: (data) => {
      setSuccess(`Sale recorded: ${data.totalCurrency} ${data.totalAmount}`);
      setError(null);
      reset();
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setTimeout(() => setSuccess(null), 5000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Sale recording failed');
      setSuccess(null);
    },
  });

  const onSubmit = (data: SaleFormData) => {
    saleMutation.mutate(data);
  };

  return (
    <div className="bg-surface rounded-2xl shadow-card p-8">
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

        <div>
          <label htmlFor="accessoryId" className="block text-sm font-medium mb-2">
            Accessory
          </label>
          <select
            {...register('accessoryId')}
            id="accessoryId"
            className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
          >
            <option value="">Select an accessory</option>
            {accessoriesData?.items.map((accessory) => (
              <option key={accessory.id} value={accessory.id}>
                {accessory.name} - {accessory.priceCurrency} {accessory.priceAmount} (Stock:{' '}
                {accessory.stockLevel})
              </option>
            ))}
          </select>
          {errors.accessoryId && (
            <p className="mt-2 text-sm text-danger">{errors.accessoryId.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="quantity" className="block text-sm font-medium mb-2">
            Quantity
          </label>
          <input
            {...register('quantity', { valueAsNumber: true })}
            id="quantity"
            type="number"
            min="1"
            defaultValue="1"
            className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
          />
          {errors.quantity && (
            <p className="mt-2 text-sm text-danger">{errors.quantity.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-6 py-3 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-mint"
        >
          {isSubmitting ? 'Recording...' : 'Record Sale'}
        </button>
      </form>
    </div>
  );
}
