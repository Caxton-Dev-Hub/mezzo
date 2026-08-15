import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../../components/auth/login-form';
import { GoogleSignInButton } from '../../../components/auth/google-sign-in-button';

export const metadata: Metadata = {
  title: 'Log in',
  description:
    'Log in to Mezzo to open an escrow, document an item, fund a deal, or follow a dispute you are part of.',
  alternates: { canonical: '/login' },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    reset?: string;
    verified?: string;
    redirectTo?: string;
  }>;
}) {
  const { reset, verified, redirectTo } = await searchParams;
  const registerHref = redirectTo
    ? `/register?redirectTo=${encodeURIComponent(redirectTo)}`
    : '/register';

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Sign in
      </h1>
      <p className="mt-2 text-sm text-fog">Welcome back. Your escrows are waiting.</p>
      {verified ? (
        <p className="mt-4 rounded-lg border border-mint/30 bg-mint/10 px-3.5 py-2.5 text-[13px] text-mint">
          Email verified — sign in to continue.
        </p>
      ) : null}
      {reset ? (
        <p className="mt-4 rounded-lg border border-mint/30 bg-mint/10 px-3.5 py-2.5 text-[13px] text-mint">
          Password updated — sign in with your new password.
        </p>
      ) : null}
      <div className="mt-7">
        <LoginForm redirectTo={redirectTo} />
      </div>
      <p className="mt-4 text-right text-[13px]">
        <Link href="/forgot-password" className="text-fog underline underline-offset-4">
          Forgot password?
        </Link>
      </p>
      <div className="mt-6">
        <GoogleSignInButton redirectTo={redirectTo} />
      </div>
      <p className="mt-6 text-center text-sm text-fog">
        New to Mezzo?{' '}
        <Link href={registerHref} className="text-vellum underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  );
}
