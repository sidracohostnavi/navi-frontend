// lib/supabase/server.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Simple server-side Supabase client for now (no auth/session handling needed yet)
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}
