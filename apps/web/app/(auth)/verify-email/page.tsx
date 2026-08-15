import type { Metadata } from 'next';
import Link from 'next/link';
import { VerifyEmailForm } from '../../../components/auth/verify-email-form';

export const metadata: Metadata = {
  title: 'Verify your email',
  description: 'Enter the code we emailed you to verify your Mezzo account.',
  alternates: { canonical: '/verify-email' },
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; redirectTo?: string }>;
}) {
  const { email, redirectTo } = await searchParams;

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Verify your email
      </h1>
      <p className="mt-2 text-sm text-fog">
        We sent a 6-digit code to your email address. Enter it below to verify your account.
      </p>
      <div className="mt-7">
        <VerifyEmailForm email={email} redirectTo={redirectTo} />
      </div>
      <p className="mt-6 text-center text-sm text-fog">
        <Link href="/login" className="text-vellum underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
