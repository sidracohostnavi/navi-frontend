// /app/api/auth/logout/route.ts
// User logout

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/authServer'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    await supabase.auth.signOut()
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}