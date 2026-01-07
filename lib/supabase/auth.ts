// /lib/supabase/auth.ts
// Client-side auth helpers for CoHost

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client (for client components)
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}