import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { REFRESH_COOKIE_NAME } from '../../lib/server-config';
import { AppShell } from '../../components/shell/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get(REFRESH_COOKIE_NAME)) {
    redirect('/login');
  }

  return <AppShell>{children}</AppShell>;
}
