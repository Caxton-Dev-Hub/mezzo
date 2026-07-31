'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { getPublicProfile } from '../../../../lib/profile-client';
import { ApiError } from '../../../../lib/api-error';
import { ProfileSummary } from '../../../../components/profile/profile-summary';

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const status = useAuthStore((state) => state.status);

  const profileQuery = useQuery({
    queryKey: ['public-profile', id],
    queryFn: () => getPublicProfile(id),
    enabled: status === 'authenticated',
  });

  if (status === 'pending' || profileQuery.isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-surface-2" />;
  }

  if (profileQuery.isError) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">
          {profileQuery.error instanceof ApiError
            ? profileQuery.error.message
            : 'Could not load this profile.'}
        </p>
      </div>
    );
  }

  const profile = profileQuery.data;
  if (!profile) {
    return null;
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-[13px] text-fog hover:text-vellum"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="mt-5">
        <ProfileSummary profile={profile} />
      </div>

      <p className="mt-4 text-[13px] text-mute">
        Mezzo shows verification status and completed escrows so you can judge who you are dealing
        with. It never shares contact details.
      </p>
    </div>
  );
}
