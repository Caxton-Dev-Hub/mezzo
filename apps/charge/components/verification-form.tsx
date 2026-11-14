'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, Check } from 'lucide-react';
import { submitVerification, uploadFile } from '@/lib/api-client';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const verificationSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(255),
  phoneNumber: z.string().min(1, 'Phone number is required').max(32),
  photo: z
    .custom<FileList>()
    .refine((files) => files?.length === 1, 'Photo is required')
    .refine(
      (files) => files?.[0]?.size <= MAX_FILE_SIZE,
      'Photo must be less than 10MB'
    )
    .refine(
      (files) => ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type),
      'Only .jpg, .jpeg, .png and .webp formats are supported'
    ),
});

type VerificationFormData = z.infer<typeof verificationSchema>;

export function VerificationForm() {
  const router = useRouter();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerificationFormData>({
    resolver: zodResolver(verificationSchema),
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: VerificationFormData) => {
    try {
      setError(null);
      const photoFile = data.photo[0];
      
      const photoStorageKey = await uploadFile(photoFile);

      await submitVerification({
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        photoStorageKey,
      });

      setIsSubmitted(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification submission failed');
    }
  };

  if (isSubmitted) {
    return (
      <div className="bg-surface rounded-2xl shadow-card p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-mint/10 flex items-center justify-center mx-auto mb-6">
          <Check className="w-8 h-8 text-mint" />
        </div>
        <h2 className="text-2xl font-display mb-3">Verification Submitted</h2>
        <p className="text-fog">
          Your verification is under review. You&apos;ll be notified once it&apos;s approved.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl shadow-card p-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 text-sm text-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium mb-2">
            Full Name
          </label>
          <input
            {...register('fullName')}
            id="fullName"
            type="text"
            className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
          />
          {errors.fullName && (
            <p className="mt-2 text-sm text-danger">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium mb-2">
            Phone Number
          </label>
          <input
            {...register('phoneNumber')}
            id="phoneNumber"
            type="tel"
            className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
          />
          {errors.phoneNumber && (
            <p className="mt-2 text-sm text-danger">{errors.phoneNumber.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="photo" className="block text-sm font-medium mb-2">
            ID Photo
          </label>
          <div className="mt-2">
            <label
              htmlFor="photo"
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-line rounded-lg cursor-pointer hover:bg-ink/50 transition-colors"
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <Upload className="w-12 h-12 text-mute mb-4" />
                  <p className="text-sm text-fog mb-1">Click to upload ID photo</p>
                  <p className="text-xs text-mute">PNG, JPG, WEBP up to 10MB</p>
                </div>
              )}
              <input
                {...register('photo')}
                id="photo"
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
          </div>
          {errors.photo && (
            <p className="mt-2 text-sm text-danger">{errors.photo.message as string}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-6 py-3 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-mint"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Verification'}
        </button>
      </form>
    </div>
  );
}
