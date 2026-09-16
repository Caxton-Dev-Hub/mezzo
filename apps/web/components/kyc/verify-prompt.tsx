'use client';

import Link from 'next/link';
import { BadgeCheck, Clock, ShieldCheck } from 'lucide-react';
import type { KycStatusResponse, SubmitManualKycDto } from '@mezzo/shared-types';
import { buttonVariants } from '../ui/button';

interface VerifyPromptProps {
  status: KycStatusResponse;
  requiredTier: SubmitManualKycDto['tier'];
  reason: string;
}

export function VerifyPrompt({ status, requiredTier, reason }: VerifyPromptProps) {
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
            <Link
              href={`/kyc/verify?tier=${requiredTier}`}
              className={buttonVariants({ size: 'sm', className: 'mt-3' })}
            >
              Verify now
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
