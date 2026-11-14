'use client';

import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { VerificationForm } from '@/components/verification-form';

function VerifyContent() {
  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display mb-2">Identity Verification</h1>
          <p className="text-fog">
            Complete your verification to start renting powerbanks. This is a one-time process.
          </p>
        </div>

        <VerificationForm />
      </main>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <AuthGuard>
      <VerifyContent />
    </AuthGuard>
  );
}
