'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ShieldOff } from 'lucide-react';
import { getPublicProfile } from '../../lib/profile-client';
import { meetsTier, PAYOUT_MIN_TIER } from '../../lib/kyc-tiers';
import { Avatar } from './avatar';

interface CounterpartyCardProps {
  userId: string;
  roleLabel: string;
}

export function CounterpartyCard({ userId, roleLabel }: CounterpartyCardProps) {
  const profileQuery = useQuery({
    queryKey: ['public-profile', userId],
    queryFn: () => getPublicProfile(userId),
  });

  const profile = profileQuery.data;

  if (!profile) {
    return <div className="h-24 animate-pulse rounded-xl bg-surface-2" />;
  }

  const verified = meetsTier(profile.kycTier, PAYOUT_MIN_TIER);

  return (
    <Link
      href={`/users/${profile.id}`}
      className="block rounded-xl border border-line-soft bg-surface p-4 hover:border-line"
    >
      <h2 className="text-sm font-medium text-vellum">{roleLabel}</h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar url={profile.avatarUrl} name={profile.businessName} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm text-vellum">{profile.businessName ?? 'Unnamed trader'}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mute">
            {verified ? (
              <>
                <BadgeCheck className="h-3.5 w-3.5 text-mint" />
                Verified
              </>
            ) : (
              <>
                <ShieldOff className="h-3.5 w-3.5" />
                Not verified
              </>
            )}
            <span aria-hidden="true">·</span>
            {profile.completedEscrows} completed
          </p>
        </div>
      </div>
    </Link>
  );
}
