import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/auth/login',
  '/auth/signup',
  '/auth/callback',
  '/entry', // Entry handles its own auth check
  '/cohost', // Public Landing Page
  '/cohost-home',  // Cohost dedicated landing page
];

// Routes that should be ignored by proxy
const IGNORED_PATTERNS = [
  '/_next',
  '/favicon.ico',
  '/api',
  '/static',
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];

  // CoHost domain detection (production + local testing)
  const isCoHostDomain = host === 'cohostnavi.com' || host === 'www.cohostnavi.com' || host === 'localhost';

  if (isCoHostDomain) {
    // Rewrite root to CoHost landing page
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/cohost-home';
      return NextResponse.rewrite(url);
    }

    // Block NaviVerse routes for CoHost users
    if (pathname.startsWith('/pulse') || pathname.startsWith('/orakl') || pathname.startsWith('/agents') || pathname.startsWith('/constellation') || pathname.startsWith('/dashboard') || pathname.startsWith('/entry')) {
      const url = request.nextUrl.clone();
      url.pathname = '/cohost-home';
      return NextResponse.redirect(url);
    }
  }
  // Skip proxy for ignored patterns
  if (IGNORED_PATTERNS.some(pattern => pathname.startsWith(pattern))) {
    return NextResponse.next();
  }

  // Skip proxy for public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Create Supabase client for auth checks
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, {
              ...options,
              secure: process.env.NODE_ENV === 'production',
            });
          });
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) {
    const redirectUrl = new URL('/auth/login', request.url);
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
