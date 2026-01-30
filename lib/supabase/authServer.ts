// /lib/supabase/authServer.ts
// Server-side auth helpers for CoHost - only use in Server Components and API routes

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server client (for server components and API routes)
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                secure: process.env.NODE_ENV === 'production',
              })
            )
          } catch {
            // Called from Server Component
          }
        },
      },
    }
  )
}

// Get current user from server context
export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

// Helper to check if support mode is active and authorized
async function getSupportModeWorkspace(userId: string): Promise<string | null> {
  const cookieStore = await cookies()
  const supportMode = cookieStore.get('support_mode')?.value === 'true'
  const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value

  if (!supportMode || !activeWorkspaceId) {
    return null
  }

  // Double check authorization (server-side enforcement)
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user || user.id !== userId) {
    return null
  }

  const allowedEmails = (process.env.DEV_SUPPORT_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
    return null
  }

  return activeWorkspaceId
}

// Get user's workspace ID
export async function getUserWorkspaceId(userId: string): Promise<string | null> {
  // 1. Check for support mode override first
  const supportWorkspaceId = await getSupportModeWorkspace(userId)
  if (supportWorkspaceId) {
    return supportWorkspaceId
  }

  const supabase = await createServerSupabaseClient()

  // Get user's workspace membership
  const { data, error } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data.workspace_id
}

// Get current user with workspace
export async function getCurrentUserWithWorkspace() {
  const user = await getCurrentUser()

  if (!user) {
    return { user: null, workspaceId: null }
  }

  const workspaceId = await getUserWorkspaceId(user.id)

  return { user, workspaceId }
}

// Check if support mode is active and ENFORCE read-only
// Use this in mutation endpoints to block writes
export async function enforceSupportReadOnly() {
  const cookieStore = await cookies()
  const supportMode = cookieStore.get('support_mode')?.value === 'true'

  if (supportMode) {
    throw new Error('Action blocked: Read-Only Support Mode Active')
  }
}