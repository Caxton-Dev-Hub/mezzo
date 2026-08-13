'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { getPlatformSettings, setVerificationEnabled } from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import { FieldError } from '../../../../components/ui/field-error';

export default function AdminSettingsPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getPlatformSettings,
    enabled: sessionStatus === 'authenticated',
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setVerificationEnabled({ enabled, reason: reason.trim() }),
    onSuccess: (settings) => {
      queryClient.setQueryData(['admin-settings'], settings);
      queryClient.invalidateQueries({ queryKey: ['kyc-status'] });
      setReason('');
    },
  });

  const settings = settingsQuery.data ?? null;
  const enabled = settings?.verificationEnabled ?? false;

  const submit = () => {
    if (reason.trim().length === 0) {
      setReasonError('Say why you are making this change — it goes into the audit trail.');
      return;
    }

    setReasonError(null);
    toggle.mutate(!enabled);
  };

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Platform settings
      </h1>
      <p className="mt-1 text-sm text-fog">
        Changes here affect every user immediately and are written to the audit trail.
      </p>

      <section className="mt-8 max-w-2xl rounded-2xl border border-line-soft bg-surface p-5 shadow-card">
        {settingsQuery.isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
        ) : settingsQuery.isError ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {settingsQuery.error instanceof ApiError
                ? settingsQuery.error.message
                : 'Could not load platform settings.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-vellum">Identity verification</h2>
                <p className="mt-1 max-w-md text-[13px] text-fog">
                  {enabled
                    ? 'Live. Users can submit verification, and tier requirements and transaction caps are enforced.'
                    : 'Shown to users as coming soon. Submissions are closed, and tier requirements and transaction caps are not enforced.'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 font-mono text-[12px] uppercase tracking-wide ${
                  enabled ? 'bg-surface-2 text-vellum' : 'bg-surface-2 text-mute'
                }`}
              >
                {enabled ? 'Live' : 'Coming soon'}
              </span>
            </div>

            {settings?.updatedAt ? (
              <p className="mt-3 text-[13px] text-mute">
                Last changed {formatDateTime(settings.updatedAt)}
              </p>
            ) : null}

            {!enabled ? (
              <p className="mt-4 rounded-xl border border-line-soft bg-surface-2 p-3 text-[13px] text-fog">
                While verification is off, nothing is gated behind a KYC tier — including withdrawals
                and per-tier transaction caps.
              </p>
            ) : null}

            <div className="mt-5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  enabled
                    ? 'Why are you taking verification offline?'
                    : 'Why are you turning verification on?'
                }
              />
              <FieldError message={reasonError ?? undefined} />
            </div>

            <Button
              type="button"
              variant={enabled ? 'secondary' : 'primary'}
              className="mt-4"
              loading={toggle.isPending}
              onClick={submit}
            >
              {enabled ? 'Set to coming soon' : 'Turn verification on'}
            </Button>

            {toggle.error ? (
              <p role="alert" className="mt-3 text-[13px] text-danger">
                {toggle.error instanceof ApiError
                  ? toggle.error.message
                  : 'Could not change this setting. Please try again.'}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
