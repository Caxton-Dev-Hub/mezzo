'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useAuthStore } from '../../../lib/auth-store';
import { getInvitePreview, acceptInvite } from '../../../lib/invite-client';
import { ApiError } from '../../../lib/api-error';
import { Wordmark } from '../../../components/shell/wordmark';
import { TermsPanel } from '../../../components/escrow/terms-panel';
import { EvidenceViewer } from '../../../components/evidence/evidence-viewer';
import { Button, buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';

export default function InvitePreviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  const previewQuery = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => getInvitePreview(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: (escrow) => {
      router.push(`/escrow/${escrow.id}`);
    },
  });

  const redirectTo = `/invite/${token}`;

  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-10 sm:px-8">
      <Link href="/" className="mb-8 sm:mb-10" aria-label="Mezzo home">
        <Wordmark />
      </Link>

      <div className="w-full max-w-lg">
        {previewQuery.isLoading ? (
          <div className="space-y-4">
            <div className="h-8 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="h-48 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : null}

        {previewQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-line-soft bg-surface shadow-card px-6 py-10 text-center">
            <Info className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {previewQuery.error instanceof ApiError
                ? previewQuery.error.message
                : 'We could not open this invite link.'}
            </p>
            <Link href="/dashboard" className="mt-4 text-sm text-mint underline underline-offset-4">
              Go to your dashboard
            </Link>
          </div>
        ) : null}

        {previewQuery.data ? (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-[1.75rem] leading-tight text-vellum">
                You&apos;ve been invited to an escrow
              </h1>
              <p className="mt-2 text-sm text-fog">
                Review the terms and evidence below, then accept to join as the{' '}
                {previewQuery.data.initiatorRole === 'BUYER' ? 'seller' : 'buyer'}.
              </p>
            </div>

            <TermsPanel terms={previewQuery.data.terms} frozen={false} />

            <div>
              <h2 className="mb-3 text-sm font-medium text-vellum">Evidence at creation</h2>
              <EvidenceViewer items={previewQuery.data.evidence} />
            </div>

            {acceptMutation.error ? (
              <p role="alert" className="text-[13px] text-danger">
                {acceptMutation.error instanceof ApiError
                  ? acceptMutation.error.message
                  : 'Could not accept this invite. Please try again.'}
              </p>
            ) : null}

            {status === 'authenticated' ? (
              <Button
                type="button"
                className="w-full"
                loading={acceptMutation.isPending}
                onClick={() => acceptMutation.mutate()}
              >
                Accept invite
              </Button>
            ) : status === 'unauthenticated' ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}
                  className={cn(buttonVariants({ className: 'flex-1' }))}
                >
                  Log in to accept
                </Link>
                <Link
                  href={`/register?redirectTo=${encodeURIComponent(redirectTo)}`}
                  className={cn(buttonVariants({ variant: 'secondary', className: 'flex-1' }))}
                >
                  Create an account
                </Link>
              </div>
            ) : (
              <div className="h-11 w-full animate-pulse rounded-full bg-surface-2" />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
