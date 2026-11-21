'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { ProfilePhotoUpload } from '@/components/profile-photo-upload';
import { getProfile } from '@/lib/api-client';
import { User, Mail, Shield, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { ProfileResponse } from '@mezzo/shared-types';

function ProfilePageContent() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getProfile();
      setProfile(data);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (photoUrl: string) => {
    if (profile) {
      setProfile({ ...profile, avatarUrl: photoUrl });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-mint animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-danger/10 border border-danger/20 rounded-lg p-6">
          <p className="text-danger">{error || 'Failed to load profile'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Profile</h1>
        <p className="text-fog">Manage your profile information and photo</p>
      </div>

      <div className="space-y-6">
        {/* Profile Photo Section */}
        <div className="bg-surface border border-line rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Profile Photo</h2>
          <ProfilePhotoUpload
            currentPhotoUrl={profile.avatarUrl}
            onUploadComplete={handlePhotoUpload}
          />
        </div>

        {/* Profile Information */}
        <div className="bg-surface border border-line rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Information</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-fog mt-0.5" />
              <div>
                <p className="text-sm text-fog">Email</p>
                <p className="font-medium">{profile.email}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-fog mt-0.5" />
              <div>
                <p className="text-sm text-fog">Role</p>
                <p className="font-medium capitalize">{profile.role.toLowerCase()}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-fog mt-0.5" />
              <div>
                <p className="text-sm text-fog">Member Since</p>
                <p className="font-medium">
                  {new Date(profile.memberSince).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {profile.kycTier !== 'TIER_0' ? (
                <CheckCircle className="w-5 h-5 text-success mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-fog mt-0.5" />
              )}
              <div>
                <p className="text-sm text-fog">Verification Status</p>
                <p className="font-medium capitalize">{profile.kycTier.toLowerCase()}</p>
              </div>
            </div>

            {profile.businessName && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-fog mt-0.5" />
                <div>
                  <p className="text-sm text-fog">Business Name</p>
                  <p className="font-medium">{profile.businessName}</p>
                </div>
              </div>
            )}

            {profile.location && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-fog mt-0.5" />
                <div>
                  <p className="text-sm text-fog">Location</p>
                  <p className="font-medium">{profile.location}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfilePageContent />
    </AuthGuard>
  );
}
