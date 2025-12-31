// lib/supabaseOraklClient.ts
import { createBrowserClient } from '@supabase/ssr';

// Browser client - use this in Client Components ('use client')
export function createOraklBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_ORAKL_SUPABASE_ANON_KEY!
  );
}

// For convenience, export a singleton for client components
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getOraklBrowserClient() {
  if (!browserClient) {
    browserClient = createOraklBrowserClient();
  }
  return browserClient;
}