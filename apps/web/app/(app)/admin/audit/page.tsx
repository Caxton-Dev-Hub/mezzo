'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { listAdminAuditEventsAll } from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';

export default function AdminAuditPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const [entityType, setEntityType] = useState('');

  const auditQuery = useQuery({
    queryKey: ['admin-audit', entityType],
    queryFn: () => listAdminAuditEventsAll(entityType.trim() || undefined),
    enabled: sessionStatus === 'authenticated',
  });

  const events = auditQuery.data ?? [];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
            Audit log
          </h1>
          <p className="mt-1 text-sm text-fog">
            Every admin action, append-only, newest first.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Label htmlFor="entity-type-filter">Filter by entity type</Label>
          <Input
            id="entity-type-filter"
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            placeholder="e.g. user, escrow, payout"
          />
        </div>
      </div>

      <div className="mt-8">
        {auditQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : auditQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {auditQuery.error instanceof ApiError
                ? auditQuery.error.message
                : 'Could not load the audit log.'}
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-mute">
            No audit events yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-mono text-[12px] uppercase tracking-wide text-vellum">
                    {event.action}
                  </p>
                  <p className="shrink-0 text-[13px] text-mute">{formatDateTime(event.createdAt)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>
                    {event.entityType} · {event.entityId}
                  </span>
                  {event.actorId ? <span>By {event.actorId}</span> : null}
                </div>
                {event.reason ? (
                  <p className="mt-2 text-[13px] text-fog">{event.reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
