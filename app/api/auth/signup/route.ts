// /app/api/auth/signup/route.ts
// User signup with automatic workspace creation

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { email, password, workspaceName } = await request.json()
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }
    
    // Create auth client
    const authClient = createClient(supabaseUrl, supabaseAnonKey)
    
    // Sign up the user
    const { data: authData, error: authError } = await authClient.auth.signUp({
      email,
      password,
    })
    
    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Signup failed' },
        { status: 400 }
      )
    }
    
    const userId = authData.user.id
    
    // Use service client to create workspace (bypasses RLS)
    const serviceClient = createCohostServiceClient()
    
    // Create workspace
    const { data: workspace, error: wsError } = await serviceClient
      .from('cohost_workspaces')
      .insert({
        name: workspaceName || `${email}'s Workspace`,
      })
      .select('id')
      .single()
    
    if (wsError || !workspace) {
      console.error('Failed to create workspace:', wsError)
      return NextResponse.json(
        { error: 'Failed to create workspace' },
        { status: 500 }
      )
    }
    
    // Add user as workspace owner
    const { error: memberError } = await serviceClient
      .from('cohost_workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
      })
    
    if (memberError) {
      console.error('Failed to add workspace member:', memberError)
      return NextResponse.json(
        { error: 'Failed to setup workspace membership' },
        { status: 500 }
      )
    }
    
    // Create default automation settings
    await serviceClient
      .from('cohost_automation_settings')
      .insert({
        workspace_id: workspace.id,
        automation_level: 1, // Manual approval by default
      })
    
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: authData.user.email,
      },
      workspace: {
        id: workspace.id,
      },
      message: 'Please check your email to confirm your account',
    })
    
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}