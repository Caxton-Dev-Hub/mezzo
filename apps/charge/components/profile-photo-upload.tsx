'use client';

import { useState, useRef } from 'react';
import { Upload, User, X, Loader2 } from 'lucide-react';
import { presignProfilePhoto, confirmProfilePhoto } from '@/lib/api-client';
import type { AvatarMimeType } from '@mezzo/shared-types';

interface ProfilePhotoUploadProps {
  currentPhotoUrl?: string | null;
  onUploadComplete?: (photoUrl: string) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfilePhotoUpload({ currentPhotoUrl, onUploadComplete }: ProfilePhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please select a JPEG, PNG, or WebP image');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be less than 5MB');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    try {
      setUploading(true);

      // Step 1: Get presigned URL
      const { uploadUrl, key } = await presignProfilePhoto({
        mimeType: file.type as AvatarMimeType,
      });

      // Step 2: Upload directly to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      // Step 3: Confirm upload with backend
      const profile = await confirmProfilePhoto({
        key,
        declaredMime: file.type as AvatarMimeType,
      });

      if (profile.avatarUrl) {
        setPreview(profile.avatarUrl);
        onUploadComplete?.(profile.avatarUrl);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload image');
      setPreview(currentPhotoUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6">
        {/* Avatar Preview */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-surface border-2 border-line flex items-center justify-center">
            {preview ? (
              <img src={preview} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-fog" />
            )}
          </div>
          {preview && !uploading && (
            <button
              onClick={handleRemove}
              className="absolute -top-1 -right-1 w-6 h-6 bg-danger rounded-full flex items-center justify-center hover:bg-danger-deep transition-colors"
              aria-label="Remove photo"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-surface/80 rounded-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-mint animate-spin" />
            </div>
          )}
        </div>

        {/* Upload Button */}
        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
            id="photo-upload"
          />
          <label
            htmlFor="photo-upload"
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-line
              bg-surface hover:bg-surface/80 transition-colors cursor-pointer
              ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">
              {uploading ? 'Uploading...' : preview ? 'Change Photo' : 'Upload Photo'}
            </span>
          </label>
          <p className="text-xs text-fog mt-2">
            JPEG, PNG, or WebP. Max 5MB.
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}
    </div>
  );
}
