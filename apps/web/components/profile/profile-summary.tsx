import { BadgeCheck, Handshake, MapPin, ShieldOff } from 'lucide-react';
import type { PublicProfileResponse } from '@mezzo/shared-types';
import { KYC_TIER_LABELS, meetsTier, PAYOUT_MIN_TIER } from '../../lib/kyc-tiers';
import { Avatar } from './avatar';

function formatMemberSince(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' }).format(date);
}

export function ProfileSummary({ profile }: { profile: PublicProfileResponse }) {
  const verified = meetsTier(profile.kycTier, PAYOUT_MIN_TIER);
  const displayName = profile.businessName ?? 'Unnamed trader';

  return (
    <div className="rounded-2xl border border-line-soft bg-surface shadow-card p-5 shadow-panel sm:p-6">
      <div className="flex items-start gap-4">
        <Avatar url={profile.avatarUrl} name={profile.businessName} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[1.5rem] leading-tight text-vellum sm:text-[1.75rem]">
            {displayName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
            {verified ? (
              <span className="inline-flex items-center gap-1.5 text-mint">
                <BadgeCheck className="h-4 w-4" />
                {KYC_TIER_LABELS[profile.kycTier]}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-mute">
                <ShieldOff className="h-4 w-4" />
                Not yet verified
              </span>
            )}
            {profile.location ? (
              <span className="inline-flex items-center gap-1.5 text-fog">
                <MapPin className="h-4 w-4" />
                {profile.location}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {profile.bio ? <p className="mt-5 text-sm leading-relaxed text-fog">{profile.bio}</p> : null}

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line-soft bg-surface-2 px-4 py-3">
          <dt className="flex items-center gap-1.5 text-[13px] text-mute">
            <Handshake className="h-4 w-4" />
            Escrows completed
          </dt>
          <dd className="mt-1 text-lg text-vellum">{profile.completedEscrows}</dd>
        </div>
        <div className="rounded-xl border border-line-soft bg-surface-2 px-4 py-3">
          <dt className="text-[13px] text-mute">Member since</dt>
          <dd className="mt-1 text-lg text-vellum">{formatMemberSince(profile.memberSince)}</dd>
        </div>
      </dl>
    </div>
  );
}
