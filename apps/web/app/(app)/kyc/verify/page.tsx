'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { KycDocumentType, KycTier } from '@mezzo/shared-types';
import { Button } from '../../../../components/ui/button';
import { KycDocumentSlot } from '../../../../components/kyc/kyc-document-slot';
import { useKycDocumentQueue } from '../../../../hooks/use-kyc-document-queue';
import { submitManualKyc } from '../../../../lib/kyc-document-client';
import { KYC_TIER_LABELS } from '../../../../lib/kyc-tiers';
import { ApiError } from '../../../../lib/api-error';

const REQUIRED_DOCUMENTS: readonly KycDocumentType[] = ['GOVERNMENT_ID', 'SELFIE'];

function isRequestableTier(value: string | null): value is KycTier {
  return value === 'TIER_1' || value === 'TIER_2' || value === 'TIER_3';
}

export default function KycVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTierParam = searchParams.get('tier');
  const tier: KycTier = isRequestableTier(requestedTierParam) ? requestedTierParam : 'TIER_1';

  const { slots, uploadDocument, confirmedDocumentIds, allConfirmed } =
    useKycDocumentQueue(REQUIRED_DOCUMENTS);

  const submit = useMutation({
    mutationFn: () =>
      submitManualKyc({
        tier: tier as Exclude<KycTier, 'TIER_0'>,
        documentIds: confirmedDocumentIds,
      }),
    onSuccess: () => router.push('/wallet'),
  });

  return (
    <div className="max-w-xl">
      <Link
        href="/wallet"
        className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-vellum"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Link>

      <h1 className="mt-4 font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Verify your identity
      </h1>
      <p className="mt-2 text-sm text-fog">
        Upload a government ID and a selfie for {KYC_TIER_LABELS[tier]}. An admin reviews
        submissions by hand — you&apos;ll be notified once it&apos;s cleared.
      </p>

      <div className="mt-6 space-y-4">
        <KycDocumentSlot
          label="Government ID"
          hint="A clear photo of your NIN, BVN slip, passport, or driver's licence."
          slot={slots.GOVERNMENT_ID}
          onSelectFile={(file) => uploadDocument('GOVERNMENT_ID', file)}
        />
        <KycDocumentSlot
          label="Selfie"
          hint="A clear photo of your face, taken now."
          slot={slots.SELFIE}
          onSelectFile={(file) => uploadDocument('SELFIE', file)}
        />
      </div>

      {submit.error ? (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {submit.error instanceof ApiError
            ? submit.error.message
            : 'Could not submit for review. Please try again.'}
        </p>
      ) : null}

      <Button
        type="button"
        className="mt-6 w-full"
        disabled={!allConfirmed}
        loading={submit.isPending}
        onClick={() => submit.mutate()}
      >
        Submit for review
      </Button>
    </div>
  );
}
