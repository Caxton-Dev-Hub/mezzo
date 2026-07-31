'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../lib/auth-store';
import { getOwnProfile } from '../../../lib/profile-client';
import { getKycStatus } from '../../../lib/kyc-client';
import { meetsTier, PAYOUT_MIN_TIER } from '../../../lib/kyc-tiers';
import { ApiError } from '../../../lib/api-error';
import { ProfileSummary } from '../../../components/profile/profile-summary';
import { ProfileForm } from '../../../components/profile/profile-form';
import { AvatarUploader } from '../../../components/profile/avatar-uploader';
import { VerifyPrompt } from '../../../components/kyc/verify-prompt';

export default function ProfilePage() {
  const status = useAuthStore((state) => state.status);
  const enabled = status === 'authenticated';

  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: getOwnProfile, enabled });
  const kycQuery = useQuery({ queryKey: ['kyc-status'], queryFn: getKycStatus, enabled });

  if (status === 'pending' || profileQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-44 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">
          {profileQuery.error instanceof ApiError
            ? profileQuery.error.message
            : 'Could not load your profile.'}
        </p>
      </div>
    );
  }

  const profile = profileQuery.data;
  if (!profile) {
    return null;
  }

  const kycStatus = kycQuery.data ?? null;
  const needsVerification = kycStatus ? !meetsTier(kycStatus.tier, PAYOUT_MIN_TIER) : false;

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Your profile
      </h1>
      <p className="mt-2 text-sm text-fog">
        This is what the other party sees before they agree to trade with you.
      </p>

      {kycStatus && needsVerification ? (
        <div className="mt-6">
          <VerifyPrompt
            status={kycStatus}
            requiredTier={PAYOUT_MIN_TIER}
            reason="A verified badge on your profile is the strongest signal you can give a counterparty. It also unlocks withdrawals."
          />
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-vellum">How others see you</h2>
        <ProfileSummary profile={profile} />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-vellum">Photo</h2>
        <AvatarUploader profile={profile} />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-vellum">Details</h2>
        <ProfileForm profile={profile} />
      </section>
    </div>
  );
}
