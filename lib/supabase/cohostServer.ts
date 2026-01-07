// /lib/supabase/cohostServer.ts
// Server-side Supabase client for CoHost with service role access
// Use this in API routes and webhooks where there's no user session

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Service role client - bypasses RLS, use only in trusted server contexts
export function createCohostServiceClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment variables')
  }
  
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Anon client for CoHost - respects RLS, use when you have user context
export function createCohostClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}