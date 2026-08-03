import { NextResponse } from 'next/server';
import { REFRESH_COOKIE_NAME } from './server-config';
import { decodeJwtExpiryMs } from './jwt';

export function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  const expiresAt = decodeJwtExpiryMs(refreshToken);

  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(expiresAt ? { expires: new Date(expiresAt) } : { maxAge: 60 * 60 * 24 * 30 }),
  });
}
