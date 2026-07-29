'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createEscrowSchema, currencySchema, escrowRoleSchema, type CreateEscrowDto } from '@mezzo/shared-types';
import { useMutation } from '@tanstack/react-query';
import { createEscrow, updateEscrowTerms } from '../../../lib/escrow-client';
import { majorToMinorUnits, minorToMajorUnitsString } from '../../../lib/money';
import { PLATFORM_FEE_BPS } from '../../../lib/constants';
import { useEscrowWizardStore } from '../../../lib/escrow-wizard-store';
import { useAuthStore } from '../../../lib/auth-store';
import { ApiError } from '../../../lib/api-error';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { FieldError } from '../../ui/field-error';

const detailsFormSchema = z.object({
  role: escrowRoleSchema,
  itemDescription: z.string().trim().min(1, 'Describe the item'),
  priceMajor: z
    .string()
    .trim()
    .min(1, 'Enter a price')
    .refine((value) => majorToMinorUnits(value) !== null, 'Enter a valid amount, e.g. 15000.00'),
  currency: currencySchema,
  deliveryMethod: z.string().trim().min(1, 'Enter a delivery method').max(255),
  inspectionWindowHours: z.coerce.number().int().positive('Enter a positive number of hours'),
});

type DetailsFormValues = z.infer<typeof detailsFormSchema>;

export function StepDetails({ onAdvance }: { onAdvance: () => void }) {
  const escrow = useEscrowWizardStore((state) => state.escrow);
  const setEscrow = useEscrowWizardStore((state) => state.setEscrow);
  const currentUser = useAuthStore((state) => state.user);

  const myRole = escrow?.parties.find((party) => party.userId === currentUser?.id)?.role;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsFormSchema),
    defaultValues: {
      role: myRole ?? 'BUYER',
      itemDescription: escrow?.terms?.itemDescription ?? '',
      priceMajor: escrow?.terms ? minorToMajorUnitsString(escrow.terms.price.amount) : '',
      currency: escrow?.terms?.price.currency ?? 'NGN',
      deliveryMethod: escrow?.terms?.deliveryMethod ?? '',
      inspectionWindowHours: escrow?.terms?.inspectionWindowHours ?? 48,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: DetailsFormValues) => {
      const amount = majorToMinorUnits(values.priceMajor);
      if (amount === null) {
        throw new Error('Invalid amount');
      }

      if (escrow) {
        const terms = await updateEscrowTerms(escrow.id, {
          price: { amount, currency: values.currency },
          inspectionWindowHours: values.inspectionWindowHours,
          deliveryMethod: values.deliveryMethod,
          itemDescription: values.itemDescription,
          feeBps: PLATFORM_FEE_BPS,
        });
        return { ...escrow, terms };
      }

      const dto: CreateEscrowDto = createEscrowSchema.parse({
        role: values.role,
        price: { amount, currency: values.currency },
        inspectionWindowHours: values.inspectionWindowHours,
        deliveryMethod: values.deliveryMethod,
        itemDescription: values.itemDescription,
        feeBps: PLATFORM_FEE_BPS,
      });
      return createEscrow(dto);
    },
    onSuccess: (result) => {
      setEscrow(result);
      onAdvance();
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));
  const busy = isSubmitting || mutation.isPending;
  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? 'Something went wrong. Please try again.'
        : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <Label>I am the</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['BUYER', 'SELLER'] as const).map((role) => (
            <label
              key={role}
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm capitalize text-vellum has-[:checked]:border-mint has-[:checked]:text-mint has-[:disabled]:opacity-50"
            >
              <input
                type="radio"
                value={role}
                disabled={Boolean(escrow)}
                className="sr-only"
                {...register('role')}
              />
              {role === 'BUYER' ? 'Buyer' : 'Seller'}
            </label>
          ))}
        </div>
        <FieldError message={errors.role?.message} />
      </div>

      <div>
        <Label htmlFor="itemDescription">Item description</Label>
        <textarea
          id="itemDescription"
          rows={3}
          aria-invalid={Boolean(errors.itemDescription)}
          className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-vellum placeholder:text-mute focus:border-fog focus:outline-none focus:ring-2 focus:ring-mint/40 aria-[invalid=true]:border-danger"
          placeholder="e.g. iPhone 14 Pro, 256GB, unlocked, mint condition"
          {...register('itemDescription')}
        />
        <FieldError message={errors.itemDescription?.message} />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <Label htmlFor="priceMajor">Price</Label>
          <Input
            id="priceMajor"
            inputMode="decimal"
            placeholder="15000.00"
            aria-invalid={Boolean(errors.priceMajor)}
            {...register('priceMajor')}
          />
          <FieldError message={errors.priceMajor?.message} />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            className="h-11 rounded-lg border border-line bg-surface px-3 text-sm text-vellum focus:border-fog focus:outline-none focus:ring-2 focus:ring-mint/40"
            {...register('currency')}
          >
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="deliveryMethod">Delivery method</Label>
        <Input
          id="deliveryMethod"
          placeholder="e.g. GIG Logistics, speed courier"
          aria-invalid={Boolean(errors.deliveryMethod)}
          {...register('deliveryMethod')}
        />
        <FieldError message={errors.deliveryMethod?.message} />
      </div>

      <div>
        <Label htmlFor="inspectionWindowHours">Inspection window (hours)</Label>
        <Input
          id="inspectionWindowHours"
          type="number"
          min={1}
          aria-invalid={Boolean(errors.inspectionWindowHours)}
          {...register('inspectionWindowHours')}
        />
        <p className="mt-1.5 text-[13px] text-mute">
          Time the buyer has to release or dispute after confirming delivery.
        </p>
        <FieldError message={errors.inspectionWindowHours?.message} />
      </div>

      <p className="text-[13px] text-mute">
        Platform fee: {(PLATFORM_FEE_BPS / 100).toFixed(2)}%, deducted from the release.
      </p>

      {serverError ? (
        <p role="alert" className="text-[13px] text-danger">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" loading={busy} className="w-full">
        Continue
      </Button>
    </form>
  );
}
