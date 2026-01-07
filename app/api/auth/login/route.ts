// /app/api/auth/login/route.ts
// User login

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }
    
    // Create auth client
    const authClient = createClient(supabaseUrl, supabaseAnonKey)
    
    // Sign in the user
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    })
    
    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Login failed' },
        { status: 401 }
      )
    }
    
    const userId = authData.user.id
    
    // Get user's workspace
    const serviceClient = createCohostServiceClient()
    const { data: membership } = await serviceClient
      .from('cohost_workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .single()
    
    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: authData.user.email,
      },
      workspace: membership ? {
        id: membership.workspace_id,
        role: membership.role,
      } : null,
      session: {
        access_token: authData.session?.access_token,
        refresh_token: authData.session?.refresh_token,
      },
    })
    
    return response
    
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}