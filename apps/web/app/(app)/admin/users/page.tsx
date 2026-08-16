'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, ShieldAlert } from 'lucide-react';
import type { UserRole, UserStatus, KycTier } from '@mezzo/shared-types';
import { useAuthStore } from '../../../../lib/auth-store';
import { listAdminUsers } from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { KYC_TIER_LABELS } from '../../../../lib/kyc-tiers';
import { Input } from '../../../../components/ui/input';
import { Select } from '../../../../components/ui/select';
import { Pagination } from '../../../../components/ui/pagination';

const PAGE_SIZE = 20;

const ROLE_FILTERS: (UserRole | 'ALL')[] = ['ALL', 'USER', 'ARBITER', 'ADMIN'];
const STATUS_FILTERS: (UserStatus | 'ALL')[] = ['ALL', 'ACTIVE', 'SUSPENDED'];
const KYC_FILTERS: (KycTier | 'ALL')[] = ['ALL', 'TIER_0', 'TIER_1', 'TIER_2', 'TIER_3'];

export default function AdminUsersPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | 'ALL'>('ALL');
  const [status, setStatus] = useState<UserStatus | 'ALL'>('ALL');
  const [kycTier, setKycTier] = useState<KycTier | 'ALL'>('ALL');

  const usersQuery = useQuery({
    queryKey: ['admin-users', { page, search, role, status, kycTier }],
    queryFn: () =>
      listAdminUsers({
        page,
        pageSize: PAGE_SIZE,
        q: search.trim() || undefined,
        role: role === 'ALL' ? undefined : role,
        status: status === 'ALL' ? undefined : status,
        kycTier: kycTier === 'ALL' ? undefined : kycTier,
      }),
    enabled: sessionStatus === 'authenticated',
    placeholderData: keepPreviousData,
  });

  const users = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Users
      </h1>
      <p className="mt-1 text-sm text-fog">
        Every account on the platform — search, change roles, and suspend when needed.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <Input
            type="search"
            placeholder="Search by email"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            className="pl-10"
            aria-label="Search users"
          />
        </div>
        <Select
          value={role}
          onChange={(event) => {
            setRole(event.target.value as UserRole | 'ALL');
            setPage(1);
          }}
          aria-label="Filter by role"
          className="sm:w-44"
        >
          {ROLE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === 'ALL' ? 'All roles' : value}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as UserStatus | 'ALL');
            setPage(1);
          }}
          aria-label="Filter by status"
          className="sm:w-44"
        >
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === 'ALL' ? 'All statuses' : value}
            </option>
          ))}
        </Select>
        <Select
          value={kycTier}
          onChange={(event) => {
            setKycTier(event.target.value as KycTier | 'ALL');
            setPage(1);
          }}
          aria-label="Filter by KYC tier"
          className="sm:w-44"
        >
          {KYC_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === 'ALL' ? 'All KYC tiers' : KYC_TIER_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-8">
        {usersQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : usersQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {usersQuery.error instanceof ApiError
                ? usersQuery.error.message
                : 'Could not load users.'}
            </p>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-mute">
            No users match these filters.
          </div>
        ) : (
          <ul className="space-y-3">
            {users.map((user) => (
              <li
                key={user.id}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <Link href={`/admin/users/${user.id}`} className="block">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-vellum">{user.email}</p>
                      <p className="mt-1 font-mono text-[12px] uppercase tracking-wide text-mute">
                        {user.role} · {KYC_TIER_LABELS[user.kycTier]}
                      </p>
                    </div>
                    <span
                      className={
                        user.status === 'SUSPENDED'
                          ? 'shrink-0 rounded-full bg-danger/15 px-3 py-1 font-mono text-[12px] uppercase tracking-wide text-danger'
                          : 'shrink-0 rounded-full bg-surface-2 px-3 py-1 font-mono text-[12px] uppercase tracking-wide text-mute'
                      }
                    >
                      {user.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                    <span>Joined {formatDateTime(user.createdAt)}</span>
                  </div>
                </Link>
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
