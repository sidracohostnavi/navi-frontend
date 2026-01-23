// app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as any; // 'signup' | 'email' | 'recovery' | 'invite'
  const next = requestUrl.searchParams.get('next') || '/dashboard';
  const error_description = requestUrl.searchParams.get('error_description');

  if (error_description) {
    console.error('Auth Callback Error:', error_description);
    return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error_description)}`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  // Case 1: Handle "PKCE" Auth Code (OAuth or newer Email flows)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.log('Auth callback success (Code), redirecting to:', next);
      return NextResponse.redirect(`${requestUrl.origin}${next}`);
    } else {
      console.error('Auth Code Exchange Error:', error);
      return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Case 2: Handle "Token Hash" (Implicit/MagicLink/Email types)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    })
    if (!error) {
      console.log('Auth callback success (Token), redirecting to:', next);
      return NextResponse.redirect(`${requestUrl.origin}${next}`);
    } else {
      console.error('Auth Token Verify Error:', error);
      return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  console.error('Auth Callback Missing Credentials');
  return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=Invalid+auth+verification+link`);
}