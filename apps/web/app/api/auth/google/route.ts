import { NextRequest, NextResponse } from 'next/server';
import { apiInternalUrl } from '../../../../lib/server-config';
import { setRefreshCookie } from '../../../../lib/refresh-cookie';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();

  const upstream = await fetch(`${apiInternalUrl()}/auth/google`, {
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
