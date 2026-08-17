'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { payoutAccountInputSchema, type PayoutAccountInput } from '@mezzo/shared-types';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select } from '../ui/select';
import { FieldError } from '../ui/field-error';
import {
  getPayoutBanks,
  savePayoutAccount,
  verifyPayoutAccount,
} from '../../lib/payments-client';
import { ApiError } from '../../lib/api-error';

interface PayoutAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function PayoutAccountModal({ open, onClose }: PayoutAccountModalProps) {
  const queryClient = useQueryClient();
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifiedFor, setVerifiedFor] = useState<PayoutAccountInput | null>(null);

  const banksQuery = useQuery({ queryKey: ['payout-banks'], queryFn: getPayoutBanks, enabled: open });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PayoutAccountInput>({
    resolver: zodResolver(payoutAccountInputSchema),
    defaultValues: { bankCode: '', accountNumber: '' },
  });

  const values = watch();
  const isVerifiedForCurrentValues =
    verifiedFor !== null &&
    verifiedFor.bankCode === values.bankCode &&
    verifiedFor.accountNumber === values.accountNumber;

  const verifyMutation = useMutation({
    mutationFn: (input: PayoutAccountInput) => verifyPayoutAccount(input),
    onSuccess: (result, input) => {
      setVerifiedName(result.accountName);
      setVerifiedFor(input);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (input: PayoutAccountInput) => savePayoutAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payout-account'] });
      reset();
      setVerifiedName(null);
      setVerifiedFor(null);
      onClose();
    },
  });

  const onVerify = handleSubmit((formValues) => {
    setVerifiedName(null);
    setVerifiedFor(null);
    verifyMutation.mutate(formValues);
  });

  const onSave = handleSubmit((formValues) => {
    saveMutation.mutate(formValues);
  });

  const handleClose = () => {
    reset();
    setVerifiedName(null);
    setVerifiedFor(null);
    onClose();
  };

  const verifyError =
    verifyMutation.error instanceof ApiError
      ? verifyMutation.error.message
      : verifyMutation.error
        ? 'Could not verify that account. Check the details and try again.'
        : null;

  const saveError =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.error
        ? 'Could not save your payout account. Please try again.'
        : null;

  return (
    <Modal open={open} onClose={handleClose} title="Add a payout account">
      <form onSubmit={onSave} noValidate className="space-y-5">
        <p className="text-sm text-fog">
          We verify your account name with your bank before saving it, so payouts always land in
          the right place.
        </p>

        <div>
          <Label htmlFor="bankCode">Bank</Label>
          <Select
            id="bankCode"
            aria-invalid={Boolean(errors.bankCode)}
            disabled={banksQuery.isLoading}
            {...register('bankCode')}
          >
            <option value="">{banksQuery.isLoading ? 'Loading banks…' : 'Select your bank'}</option>
            {(banksQuery.data ?? []).map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.name}
              </option>
            ))}
          </Select>
          <FieldError message={errors.bankCode?.message} />
        </div>

        <div>
          <Label htmlFor="accountNumber">Account number</Label>
          <Input
            id="accountNumber"
            inputMode="numeric"
            maxLength={10}
            aria-invalid={Boolean(errors.accountNumber)}
            {...register('accountNumber')}
          />
          <FieldError message={errors.accountNumber?.message} />
        </div>

        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={verifyMutation.isPending}
            onClick={onVerify}
          >
            Verify account
          </Button>
          {isVerifiedForCurrentValues && verifiedName ? (
            <p className="mt-2 text-[13px] text-mint">Account name: {verifiedName}</p>
          ) : null}
          {verifyError ? (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {verifyError}
            </p>
          ) : null}
        </div>

        {saveError ? (
          <p role="alert" className="text-[13px] text-danger">
            {saveError}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saveMutation.isPending} disabled={!isVerifiedForCurrentValues}>
            Save payout account
          </Button>
        </div>
      </form>
    </Modal>
  );
}
