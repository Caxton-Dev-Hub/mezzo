import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { REFRESH_COOKIE_NAME } from '../lib/server-config';

export default async function RootPage() {
  const cookieStore = await cookies();
  redirect(cookieStore.get(REFRESH_COOKIE_NAME) ? '/dashboard' : '/login');
}
