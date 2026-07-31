'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BIO_MAX_LENGTH,
  BUSINESS_NAME_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  updateProfileSchema,
  type ProfileResponse,
  type UpdateProfileDto,
} from '@mezzo/shared-types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { FieldError } from '../ui/field-error';
import { ApiError } from '../../lib/api-error';
import { updateProfile } from '../../lib/profile-client';

export function ProfileForm({ profile }: { profile: ProfileResponse }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UpdateProfileDto>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      businessName: profile.businessName ?? '',
      bio: profile.bio ?? '',
      location: profile.location ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (dto: UpdateProfileDto) => updateProfile(dto),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated);
      reset({
        businessName: updated.businessName ?? '',
        bio: updated.bio ?? '',
        location: updated.location ?? '',
      });
    },
  });

  const onSubmit = handleSubmit((dto) => mutation.mutate(dto));

  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? 'Could not save your profile. Please try again.'
        : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          maxLength={BUSINESS_NAME_MAX_LENGTH}
          placeholder="Ada Electronics"
          aria-invalid={Boolean(errors.businessName)}
          {...register('businessName')}
        />
        <FieldError message={errors.businessName?.message} />
      </div>
      <div>
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          maxLength={LOCATION_MAX_LENGTH}
          placeholder="Lagos"
          aria-invalid={Boolean(errors.location)}
          {...register('location')}
        />
        <FieldError message={errors.location?.message} />
      </div>
      <div>
        <Label htmlFor="bio">What you trade</Label>
        <Textarea
          id="bio"
          rows={3}
          maxLength={BIO_MAX_LENGTH}
          placeholder="Refurbished laptops and phones, shipped nationwide."
          aria-invalid={Boolean(errors.bio)}
          {...register('bio')}
        />
        <FieldError message={errors.bio?.message} />
      </div>
      {serverError ? (
        <p role="alert" className="text-[13px] text-danger">
          {serverError}
        </p>
      ) : null}
      {mutation.isSuccess && !isDirty ? (
        <p role="status" className="text-[13px] text-mint">
          Profile saved.
        </p>
      ) : null}
      <Button type="submit" loading={mutation.isPending} disabled={!isDirty}>
        Save profile
      </Button>
    </form>
  );
}
