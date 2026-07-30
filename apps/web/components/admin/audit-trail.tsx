'use client';

import { useQuery } from '@tanstack/react-query';
import { listAuditEvents } from '../../lib/admin-client';
import { AUDIT_ACTION_LABELS } from '../../lib/arbitration-labels';
import { formatDateTime } from '../../lib/format-date';

interface AuditTrailProps {
  disputeId: string;
  visible: boolean;
}

export function AuditTrail({ disputeId, visible }: AuditTrailProps) {
  const auditQuery = useQuery({
    queryKey: ['audit', 'dispute', disputeId],
    queryFn: () => listAuditEvents('dispute', disputeId),
    enabled: visible,
  });

  return (
    <section aria-label="Audit trail" className="rounded-xl border border-line-soft bg-surface p-4">
      <h2 className="text-sm font-medium text-vellum">Audit trail</h2>
      {!visible ? (
        <p className="mt-2 text-[13px] text-mute">
          The immutable audit log is visible to administrators.
        </p>
      ) : auditQuery.isLoading ? (
        <div className="mt-3 h-12 animate-pulse rounded-lg bg-surface-2" />
      ) : auditQuery.isError ? (
        <p className="mt-2 text-[13px] text-mute">Could not load the audit trail.</p>
      ) : (auditQuery.data ?? []).length === 0 ? (
        <p className="mt-2 text-[13px] text-mute">Nothing recorded against this dispute yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {auditQuery.data?.map((event) => (
            <li key={event.id} className="border-l border-line pl-3">
              <p className="text-[13px] text-vellum">
                {AUDIT_ACTION_LABELS[event.action] ?? event.action}
              </p>
              <p className="mt-0.5 text-[12px] text-mute">{formatDateTime(event.createdAt)}</p>
              {event.reason ? (
                <p className="mt-1 text-[12px] text-fog">{event.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
