'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { verifyEmailSchema, type VerifyEmailDto } from '@mezzo/shared-types';
import { useVerifyEmail } from '../../hooks/use-verify-email';
import { useResendVerification } from '../../hooks/use-resend-verification';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FieldError } from '../ui/field-error';

interface VerifyEmailFormProps {
  email?: string;
  redirectTo?: string;
}

export function VerifyEmailForm({ email, redirectTo }: VerifyEmailFormProps) {
  const router = useRouter();
  const verifyMutation = useVerifyEmail();
  const resendMutation = useResendVerification();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailDto>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { email: email ?? '', code: '' },
  });

  const onSubmit = handleSubmit((dto) => {
    verifyMutation.mutate(dto, {
      onSuccess: () => {
        const query = new URLSearchParams({ verified: '1' });
        if (redirectTo) {
          query.set('redirectTo', redirectTo);
        }
        router.push(`/login?${query.toString()}`);
      },
    });
  });

  const onResend = () => {
    const currentEmail = getValues('email');
    if (currentEmail) {
      resendMutation.mutate({ email: currentEmail });
    }
  };

  const busy = isSubmitting || verifyMutation.isPending;
  const serverError =
    verifyMutation.error instanceof ApiError
      ? verifyMutation.error.message
      : verifyMutation.error
        ? 'Something went wrong. Please try again.'
        : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="code">Verification code</Label>
        <Input
          id="code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="123456"
          aria-invalid={Boolean(errors.code)}
          {...register('code')}
        />
        <FieldError message={errors.code?.message} />
      </div>
      {serverError ? (
        <p role="alert" className="text-[13px] text-danger">
          {serverError}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="w-full">
        Verify email
      </Button>
      <div className="text-center text-[13px] text-fog">
        {resendMutation.isSuccess ? (
          <span role="status" className="text-mint">
            New code sent — check your inbox.
          </span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={resendMutation.isPending}
            className="rounded-sm text-vellum underline underline-offset-4 disabled:opacity-50"
          >
            {resendMutation.isPending ? 'Sending…' : "Didn't get a code? Resend it"}
          </button>
        )}
      </div>
    </form>
  );
}
