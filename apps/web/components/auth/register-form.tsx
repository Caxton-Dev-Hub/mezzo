'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { registerSchema, type RegisterDto } from '@mezzo/shared-types';
import { useRegister } from '../../hooks/use-register';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FieldError } from '../ui/field-error';

interface RegisterFormProps {
  redirectTo?: string;
}

export function RegisterForm({ redirectTo }: RegisterFormProps) {
  const router = useRouter();
  const mutation = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterDto>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit((dto) => {
    mutation.mutate(dto, {
      onSuccess: () => {
        const query = new URLSearchParams({ registered: '1' });
        if (redirectTo) {
          query.set('redirectTo', redirectTo);
        }
        router.push(`/login?${query.toString()}`);
      },
    });
  });

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
      <div>
        <Label htmlFor="password">Password</Label>
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
        Create account
      </Button>
    </form>
  );
}
