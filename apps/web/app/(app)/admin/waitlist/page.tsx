'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { listAdminWaitlist } from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { Pagination } from '../../../../components/ui/pagination';

const PAGE_SIZE = 20;

export default function AdminWaitlistPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const [page, setPage] = useState(1);

  const waitlistQuery = useQuery({
    queryKey: ['admin-waitlist', page],
    queryFn: () => listAdminWaitlist(page, PAGE_SIZE),
    enabled: sessionStatus === 'authenticated',
    placeholderData: keepPreviousData,
  });

  const signups = waitlistQuery.data?.items ?? [];
  const total = waitlistQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Waitlist
      </h1>
      <p className="mt-1 text-sm text-fog">
        Everyone who has asked to be notified from the landing page, newest first.
      </p>

      <div className="mt-8">
        {waitlistQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-14 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-14 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : waitlistQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {waitlistQuery.error instanceof ApiError
                ? waitlistQuery.error.message
                : 'Could not load the waitlist.'}
            </p>
          </div>
        ) : signups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-mute">
            Nobody has joined the waitlist yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {signups.map((signup) => (
              <li
                key={signup.email}
                className="flex items-center justify-between rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <p className="truncate text-sm text-vellum">{signup.email}</p>
                <p className="shrink-0 text-[13px] text-mute">{formatDateTime(signup.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}

        {total > 0 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="mt-6"
          />
        ) : null}
      </div>
    </div>
  );
}
