import { NextRequest, NextResponse } from 'next/server';
import { apiInternalUrl, REFRESH_COOKIE_NAME } from '../../../../lib/server-config';
import { decodeJwtExpiryMs } from '../../../../lib/jwt';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { statusCode: 401, code: 'NO_SESSION', message: 'No active session' },
      { status: 401 },
    );
  }

  const upstream = await fetch(`${apiInternalUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!upstream.ok) {
    const data = await upstream.json();
    const response = NextResponse.json(data, { status: upstream.status });
    response.cookies.delete(REFRESH_COOKIE_NAME);
    return response;
  }

  const { accessToken, refreshToken: newRefreshToken } = (await upstream.json()) as {
    accessToken: string;
    refreshToken: string;
  };

  const meResponse = await fetch(`${apiInternalUrl()}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!meResponse.ok) {
    const response = NextResponse.json(
      { statusCode: 401, code: 'SESSION_INVALID', message: 'Could not load the current user' },
      { status: 401 },
    );
    response.cookies.delete(REFRESH_COOKIE_NAME);
    return response;
  }

  const user = await meResponse.json();
  const response = NextResponse.json({ accessToken, user }, { status: 200 });

  const expiresAt = decodeJwtExpiryMs(newRefreshToken);
  response.cookies.set(REFRESH_COOKIE_NAME, newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(expiresAt ? { expires: new Date(expiresAt) } : { maxAge: 60 * 60 * 24 * 30 }),
  });

  return response;
}
