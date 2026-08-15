'use client';

import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { joinWaitlistSchema, type JoinWaitlistDto } from '@mezzo/shared-types';
import { useJoinWaitlist } from '../../hooks/use-join-waitlist';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { FieldError } from '../ui/field-error';
import { cn } from '../../lib/utils';

interface WaitlistFormProps {
  className?: string;
}

export function WaitlistForm({ className }: WaitlistFormProps) {
  const emailId = useId();
  const mutation = useJoinWaitlist();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinWaitlistDto>({ resolver: zodResolver(joinWaitlistSchema) });

  const onSubmit = handleSubmit((dto) => {
    mutation.mutate(dto);
  });

  if (mutation.isSuccess) {
    return (
      <div
        role="status"
        className={cn(
          'flex items-center justify-center gap-2 rounded-full border border-mint/30 bg-mint/10 px-5 py-3 text-[13px] text-mint',
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        You&rsquo;re on the list. We&rsquo;ll email you when it&rsquo;s your turn.
      </div>
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
    <form onSubmit={onSubmit} noValidate className={className}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 text-left">
          <label htmlFor={emailId} className="sr-only">
            Email
          </label>
          <Input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </div>
        <Button type="submit" loading={busy} className="shrink-0">
          Join the waitlist
        </Button>
      </div>
      <FieldError message={errors.email?.message} />
      {serverError ? (
        <p role="alert" className="mt-1.5 text-[13px] text-danger">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
