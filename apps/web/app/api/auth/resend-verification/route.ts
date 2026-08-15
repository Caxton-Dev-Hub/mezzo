import { NextRequest, NextResponse } from 'next/server';
import { apiInternalUrl } from '../../../../lib/server-config';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();

  const upstream = await fetch(`${apiInternalUrl()}/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  }

  return new NextResponse(null, { status: 204 });
}
