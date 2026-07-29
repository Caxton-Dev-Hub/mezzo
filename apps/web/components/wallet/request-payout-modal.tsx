'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { KycStatusResponse, Money } from '@mezzo/shared-types';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FieldError } from '../ui/field-error';
import { VerifyPrompt } from '../kyc/verify-prompt';
import { requestPayout } from '../../lib/payments-client';
import { tierBlockedBy } from '../../lib/kyc-tiers';
import { formatMoney, majorToMinorUnits } from '../../lib/money';
import { ApiError } from '../../lib/api-error';

const payoutFormSchema = z.object({
  amountMajor: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => {
      const minor = majorToMinorUnits(value);
      return minor !== null && minor > 0;
    }, 'Enter a valid amount, e.g. 15000.00'),
  bankAccountNumber: z.string().trim().min(1, 'Enter your account number').max(32),
  bankCode: z.string().trim().min(1, 'Enter your bank code').max(32),
});

type PayoutFormValues = z.infer<typeof payoutFormSchema>;

interface RequestPayoutModalProps {
  open: boolean;
  available: Money;
  kycStatus: KycStatusResponse;
  onClose: () => void;
}

export function RequestPayoutModal({
  open,
  available,
  kycStatus,
  onClose,
}: RequestPayoutModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutFormSchema),
    defaultValues: { amountMajor: '', bankAccountNumber: '', bankCode: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: PayoutFormValues) => {
      const amount = majorToMinorUnits(values.amountMajor);
      if (amount === null) {
        throw new Error('Invalid amount');
      }

      return requestPayout({
        amount: { amount, currency: available.currency },
        bankAccountNumber: values.bankAccountNumber,
        bankCode: values.bankCode,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
      reset();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const amount = majorToMinorUnits(values.amountMajor);
    if (amount !== null && amount > available.amount) {
      setError('amountMajor', {
        message: `You can withdraw up to ${formatMoney(available.amount, available.currency)}`,
      });
      return;
    }
    mutation.mutate(values);
  });

  const blockedTier = tierBlockedBy(mutation.error, kycStatus.tier);
  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? 'Could not request the payout. Please try again.'
        : null;

  if (blockedTier) {
    return (
      <Modal open={open} onClose={onClose} title="Withdraw to your bank">
        <VerifyPrompt
          status={kycStatus}
          requiredTier={blockedTier}
          reason="Payouts need a verified identity before we can send money to a bank account."
        />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Withdraw to your bank">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <p className="text-sm text-fog">
          Available to withdraw: {formatMoney(available.amount, available.currency)}
        </p>

        <div>
          <Label htmlFor="amountMajor">Amount</Label>
          <Input
            id="amountMajor"
            inputMode="decimal"
            placeholder="15000.00"
            aria-invalid={Boolean(errors.amountMajor)}
            {...register('amountMajor')}
          />
          <FieldError message={errors.amountMajor?.message} />
        </div>

        <div>
          <Label htmlFor="bankAccountNumber">Account number</Label>
          <Input
            id="bankAccountNumber"
            inputMode="numeric"
            aria-invalid={Boolean(errors.bankAccountNumber)}
            {...register('bankAccountNumber')}
          />
          <FieldError message={errors.bankAccountNumber?.message} />
        </div>

        <div>
          <Label htmlFor="bankCode">Bank code</Label>
          <Input
            id="bankCode"
            aria-invalid={Boolean(errors.bankCode)}
            {...register('bankCode')}
          />
          <FieldError message={errors.bankCode?.message} />
        </div>

        <p className="text-[13px] text-mute">
          Payouts stay pending until your bank confirms the transfer to us.
        </p>

        {serverError ? (
          <p role="alert" className="text-[13px] text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Request payout
          </Button>
        </div>
      </form>
    </Modal>
  );
}
