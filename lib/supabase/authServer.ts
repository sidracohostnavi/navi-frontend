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
              cookieStore.set(name, value, options)
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

// Get user's workspace ID
export async function getUserWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  
  const { data, error } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .single()
  
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