import Link from 'next/link';
import { LoginForm } from '../../../components/auth/login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; redirectTo?: string }>;
}) {
  const { registered, redirectTo } = await searchParams;
  const registerHref = redirectTo
    ? `/register?redirectTo=${encodeURIComponent(redirectTo)}`
    : '/register';

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Sign in
      </h1>
      <p className="mt-2 text-sm text-fog">Welcome back. Your escrows are waiting.</p>
      {registered ? (
        <p className="mt-4 rounded-lg border border-mint/30 bg-mint/10 px-3.5 py-2.5 text-[13px] text-mint">
          Account created — sign in to continue.
        </p>
      ) : null}
      <div className="mt-7">
        <LoginForm redirectTo={redirectTo} />
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
