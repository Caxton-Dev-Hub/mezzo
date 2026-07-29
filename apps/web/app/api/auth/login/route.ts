import { NextRequest, NextResponse } from 'next/server';
import { apiInternalUrl, REFRESH_COOKIE_NAME } from '../../../../lib/server-config';
import { decodeJwtExpiryMs } from '../../../../lib/jwt';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();

  const upstream = await fetch(`${apiInternalUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const { accessToken, refreshToken, user } = data as {
    accessToken: string;
    refreshToken: string;
    user: unknown;
  };

  const response = NextResponse.json({ accessToken, user }, { status: 200 });
  setRefreshCookie(response, refreshToken);
  return response;
}

function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  const expiresAt = decodeJwtExpiryMs(refreshToken);
  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(expiresAt ? { expires: new Date(expiresAt) } : { maxAge: 60 * 60 * 24 * 30 }),
  });
}
