'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getShops, checkout } from '@/lib/api-client';
import { PowerbankSelector } from './powerbank-selector';

const checkoutSchema = z.object({
  shopId: z.string().uuid('Please select a shop'),
  powerbankId: z.string().uuid('Please select a powerbank'),
  customerEmail: z.string().email('Invalid email address'),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export function StaffCheckoutForm() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: shopsData } = useQuery({
    queryKey: ['shops'],
    queryFn: getShops,
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
  });

  const selectedShopId = watch('shopId');

  const checkoutMutation = useMutation({
    mutationFn: checkout,
    onSuccess: (data) => {
      setSuccess(`Rental created successfully: ${data.rental.id.slice(0, 8)}`);
      setError(null);
      reset();
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      setTimeout(() => setSuccess(null), 5000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setSuccess(null);
    },
  });

  const onSubmit = (data: CheckoutFormData) => {
    checkoutMutation.mutate({
      shopId: data.shopId,
      powerbankId: data.powerbankId,
    });
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

        <Controller
          name="powerbankId"
          control={control}
          render={({ field }) => (
            <PowerbankSelector
              shopId={selectedShopId || null}
              value={field.value}
              onChange={field.onChange}
              disabled={!selectedShopId}
            />
          )}
        />
        {errors.powerbankId && (
          <p className="mt-2 text-sm text-danger">{errors.powerbankId.message}</p>
        )}

        <div>
          <label htmlFor="customerEmail" className="block text-sm font-medium mb-2">
            Customer Email
          </label>
          <input
            {...register('customerEmail')}
            id="customerEmail"
            type="email"
            placeholder="customer@example.com"
            className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
          />
          {errors.customerEmail && (
            <p className="mt-2 text-sm text-danger">{errors.customerEmail.message}</p>
          )}
          <p className="mt-2 text-xs text-mute">
            Customer must be verified before checkout
          </p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-6 py-3 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-mint"
        >
          {isSubmitting ? 'Processing...' : 'Checkout'}
        </button>
      </form>
    </div>
  );
}
