'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import type { ProfileResponse } from '@mezzo/shared-types';
import { Button } from '../ui/button';
import { Avatar } from './avatar';
import { ApiError } from '../../lib/api-error';
import { prepareAvatar } from '../../lib/avatar-image';
import { confirmAvatar, presignAvatar } from '../../lib/profile-client';
import { uploadFileToPresignedUrl } from '../../lib/evidence-client';

export function AvatarUploader({ profile }: { profile: ProfileResponse }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const prepared = await prepareAvatar(file);
      const presigned = await presignAvatar({ mimeType: prepared.mimeType });
      await uploadFileToPresignedUrl(presigned.uploadUrl, prepared.blob, prepared.mimeType);
      return confirmAvatar({ key: presigned.key, declaredMime: prepared.mimeType });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated);
      setError(null);
    },
    onError: (cause) => {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not upload that photo. Please try again.',
      );
    },
  });

  return (
    <div className="flex items-center gap-4">
      <Avatar url={profile.avatarUrl} name={profile.businessName} size="lg" />
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="avatar-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              upload.mutate(file);
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-4 w-4" />
          {profile.avatarUrl ? 'Change photo' : 'Add photo'}
        </Button>
        <p className="mt-2 text-[13px] text-mute">
          Buyers and sellers see this. Location data is stripped before upload.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
