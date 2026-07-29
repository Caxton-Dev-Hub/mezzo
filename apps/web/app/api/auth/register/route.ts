import { NextRequest, NextResponse } from 'next/server';
import { apiInternalUrl } from '../../../../lib/server-config';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();

  const upstream = await fetch(`${apiInternalUrl()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
