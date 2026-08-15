'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginSchema, type LoginDto } from '@mezzo/shared-types';
import { useLogin } from '../../hooks/use-login';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FieldError } from '../ui/field-error';

interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const mutation = useLogin();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((dto) => {
    mutation.mutate(dto, {
      onSuccess: () => {
        router.push(redirectTo || '/dashboard');
      },
    });
  });

  const busy = isSubmitting || mutation.isPending;
  const needsVerification =
    mutation.error instanceof ApiError && mutation.error.code === 'EMAIL_NOT_VERIFIED';
  const verifyEmailHref = (() => {
    const query = new URLSearchParams({ email: getValues('email') });
    if (redirectTo) {
      query.set('redirectTo', redirectTo);
    }
    return `/verify-email?${query.toString()}`;
  })();
  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        <FieldError message={errors.password?.message} />
      </div>
      {serverError ? (
        <p role="alert" className="text-[13px] text-danger">
          {serverError}
          {needsVerification ? (
            <>
              {' '}
              <Link href={verifyEmailHref} className="underline underline-offset-4">
                Verify it now
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
