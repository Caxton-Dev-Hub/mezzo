'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordDto } from '@mezzo/shared-types';
import { useForgotPassword } from '../../hooks/use-forgot-password';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FieldError } from '../ui/field-error';

export function ForgotPasswordForm() {
  const mutation = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordDto>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit((dto) => {
    mutation.mutate(dto);
  });

  if (mutation.isSuccess) {
    return (
      <p role="status" className="rounded-lg border border-mint/30 bg-mint/10 px-3.5 py-3 text-[13px] text-mint">
        If that email has a Mezzo account, a reset link is on its way. The link expires in an hour.
      </p>
    );
  }

  const busy = isSubmitting || mutation.isPending;
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
      {serverError ? (
        <p role="alert" className="text-[13px] text-danger">
          {serverError}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="w-full">
        Send reset link
      </Button>
    </form>
  );
}
