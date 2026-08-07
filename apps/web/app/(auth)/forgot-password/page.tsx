import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '../../../components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Send yourself a link to choose a new password for your Mezzo account.',
  alternates: { canonical: '/forgot-password' },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Forgot password
      </h1>
      <p className="mt-2 text-sm text-fog">
        Enter the email on your account and we will send you a link to set a new password.
      </p>
      <div className="mt-7">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-fog">
        Remembered it?{' '}
        <Link href="/login" className="text-vellum underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
