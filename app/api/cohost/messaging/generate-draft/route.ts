// /app/api/cohost/messaging/generate-draft/route.ts
// On-demand AI draft generation for the thread view UI.
// Also called manually when the host clicks "Generate Draft".
//
// Auto-generation happens in MessageProcessor during cron — this endpoint
// is the fallback when the host wants a fresh draft mid-conversation.
//
// POST body: { conversation_id, message_id }

import { NextRequest, NextResponse } from 'next/server'
import { createCohostClient } from '@/lib/supabase/cohostServer'
import { DraftGeneratorService } from '@/lib/services/draft-generator'

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, message_id } = await request.json()

    if (!conversation_id || !message_id) {
      return NextResponse.json(
        { error: 'conversation_id and message_id are required' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const supabase = createCohostClient()

    // Dismiss any existing pending draft for this conversation before generating a new one
    // (so regeneration works cleanly — old pending draft goes away)
    await supabase
      .from('cohost_ai_drafts')
      .update({ status: 'dismissed' })
      .eq('conversation_id', conversation_id)
      .eq('triggered_by_message_id', message_id)
      .eq('status', 'pending')

    const result = await DraftGeneratorService.generateForMessage(
      conversation_id,
      message_id,
      supabase
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ draft: result.draft })
  } catch (err: any) {
    console.error('[messaging/generate-draft] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
