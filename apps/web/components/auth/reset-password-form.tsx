'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { resetPasswordSchema, type ResetPasswordDto } from '@mezzo/shared-types';
import { useResetPassword } from '../../hooks/use-reset-password';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FieldError } from '../ui/field-error';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const mutation = useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordDto>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = handleSubmit((dto) => {
    mutation.mutate(dto, {
      onSuccess: () => {
        router.push('/login?reset=1');
      },
    });
  });

  const busy = isSubmitting || mutation.isPending || mutation.isSuccess;
  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? 'Something went wrong. Please try again.'
        : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <input type="hidden" {...register('token')} />
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        <FieldError message={errors.password?.message} />
      </div>
      {serverError ? (
        <p role="alert" className="text-[13px] text-danger">
          {serverError}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="w-full">
        Set new password
      </Button>
    </form>
  );
}
