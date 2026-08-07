import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { REFRESH_COOKIE_NAME } from '../../lib/server-config';
import { Wordmark } from '../../components/shell/wordmark';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (cookieStore.get(REFRESH_COOKIE_NAME)) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10 sm:px-8">
      <Link href="/" className="mb-8 sm:mb-10" aria-label="Mezzo home">
        <Wordmark />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-float sm:p-8">
        {children}
      </div>
    </div>
  );
}
