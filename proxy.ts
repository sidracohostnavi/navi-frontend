import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = { matcher: '/' };

export default function proxy(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];

  if (host === 'cohostnavi.com' || host === 'www.cohostnavi.com') {
    const url = request.nextUrl.clone();
    url.pathname = '/cohost';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}
