import { NextResponse } from 'next/server';
import { REFRESH_COOKIE_NAME } from '../../../../lib/server-config';

export async function POST(): Promise<NextResponse> {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(REFRESH_COOKIE_NAME);
  return response;
}
