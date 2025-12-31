// lib/supabaseOraklServer.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server client - use this in Server Components and Route Handlers
export async function createOraklServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_ORAKL_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}