import Link from 'next/link';
import { RegisterForm } from '../../../components/auth/register-form';
import { GoogleSignInButton } from '../../../components/auth/google-sign-in-button';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const loginHref = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login';

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-fog">
        Escrow that documents the item before money moves.
      </p>
      <div className="mt-7">
        <RegisterForm redirectTo={redirectTo} />
      </div>
      <div className="mt-6">
        <GoogleSignInButton redirectTo={redirectTo} />
      </div>
      <p className="mt-6 text-center text-sm text-fog">
        Already have an account?{' '}
        <Link href={loginHref} className="text-vellum underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
