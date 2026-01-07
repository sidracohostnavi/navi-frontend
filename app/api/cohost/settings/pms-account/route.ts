// /app/api/cohost/settings/pms-account/route.ts
// Save PMS account credentials

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, pmsType, apiKey } = await request.json()
    
    if (!workspaceId || !pmsType || !apiKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    if (!['lodgify', 'guesty', 'hostaway'].includes(pmsType)) {
      return NextResponse.json(
        { error: 'Invalid PMS type' },
        { status: 400 }
      )
    }
    
    const supabase = createCohostServiceClient()
    
    // Check if account already exists
    const { data: existing } = await supabase
      .from('cohost_pms_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('pms_type', pmsType)
      .single()
    
    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from('cohost_pms_accounts')
        .update({
          credentials_json: { api_key: apiKey }
        })
        .eq('id', existing.id)
      
      if (updateError) {
        console.error('Failed to update PMS account:', updateError)
        return NextResponse.json(
          { error: 'Failed to update credentials' },
          { status: 500 }
        )
      }
    } else {
      // Create new
      const { error: insertError } = await supabase
        .from('cohost_pms_accounts')
        .insert({
          workspace_id: workspaceId,
          pms_type: pmsType,
          credentials_json: { api_key: apiKey },
          webhook_secret: `webhook-${Date.now()}-${Math.random().toString(36).slice(2)}`
        })
      
      if (insertError) {
        console.error('Failed to create PMS account:', insertError)
        return NextResponse.json(
          { error: 'Failed to save credentials' },
          { status: 500 }
        )
      }
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('PMS account save error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}