import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '../../../components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
  description: 'Choose a new password for your Mezzo account.',
  alternates: { canonical: '/reset-password' },
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Set a new password
      </h1>
      {token ? (
        <>
          <p className="mt-2 text-sm text-fog">
            Choose a password of at least 8 characters. This signs you out everywhere else.
          </p>
          <div className="mt-7">
            <ResetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-fog">
          This reset link is missing its token. Request a new one from{' '}
          <Link href="/forgot-password" className="text-vellum underline underline-offset-4">
            forgot password
          </Link>
          .
        </p>
      )}
      <p className="mt-6 text-center text-sm text-fog">
        <Link href="/login" className="text-vellum underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
