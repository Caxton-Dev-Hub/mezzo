'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Clock, ShieldCheck } from 'lucide-react';
import type { KycStatusResponse, SubmitKycDto } from '@mezzo/shared-types';
import { Button } from '../ui/button';
import { submitKycVerification } from '../../lib/kyc-client';
import { ApiError } from '../../lib/api-error';

interface VerifyPromptProps {
  status: KycStatusResponse;
  requiredTier: SubmitKycDto['tier'];
  reason: string;
}

export function VerifyPrompt({ status, requiredTier, reason }: VerifyPromptProps) {
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: () => submitKycVerification({ tier: requiredTier }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kyc-status'] }),
  });

  const pendingReview = status.latestVerification?.status === 'PENDING';

  if (!status.verificationEnabled) {
    return (
      <div className="rounded-xl border border-line-soft bg-surface-2 p-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-mute" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-vellum">Verification is coming soon</h3>
            <p className="mt-1 text-[13px] text-fog">
              Identity verification is not live yet, so nothing here is blocked on it. You can carry
              on as normal — we&apos;ll let you know when it opens.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line-soft bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-buyer" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-vellum">Verify your identity to continue</h3>
          <p className="mt-1 text-[13px] text-fog">{reason}</p>

          {pendingReview ? (
            <p className="mt-3 inline-flex items-center gap-2 text-[13px] text-mute">
              <BadgeCheck className="h-4 w-4" />
              Your verification is in review. We&apos;ll unlock this as soon as it clears.
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              className="mt-3"
              loading={submit.isPending}
              onClick={() => submit.mutate()}
            >
              Verify now
            </Button>
          )}

          {submit.error ? (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {submit.error instanceof ApiError
                ? submit.error.message
                : 'Could not start verification. Please try again.'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
