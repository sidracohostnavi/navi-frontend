// /app/api/cohost/generate-draft/route.ts
// AI draft generation with property context and message categorization

import { NextRequest, NextResponse } from 'next/server'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Message categories for classification
const CATEGORIES = [
  'check_in',
  'check_out', 
  'wifi',
  'parking',
  'amenities',
  'noise_complaint',
  'maintenance',
  'refund_request',
  'directions',
  'recommendations',
  'emergency',
  'general',
] as const

type MessageCategory = typeof CATEGORIES[number]

// Risk levels by category
const CATEGORY_RISK: Record<MessageCategory, 'low' | 'med' | 'high'> = {
  check_in: 'low',
  check_out: 'low',
  wifi: 'low',
  parking: 'low',
  amenities: 'low',
  directions: 'low',
  recommendations: 'low',
  general: 'low',
  maintenance: 'med',
  noise_complaint: 'high',
  refund_request: 'high',
  emergency: 'high',
}

export async function POST(request: NextRequest) {
  try {
    const { messageId } = await request.json()

    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 })
    }

    const supabase = createCohostServiceClient()

    // 1. Get the message with conversation details
    const { data: message, error: msgError } = await supabase
      .from('cohost_messages')
      .select(`
        id,
        body,
        workspace_id,
        conversation_id,
        cohost_conversations (
          id,
          guest_name,
          property_id,
          pms_type
        )
      `)
      .eq('id', messageId)
      .single()

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const conversation = message.cohost_conversations as any
    const workspaceId = message.workspace_id

    // 2. Get property details if available
    let propertyContext = ''
    let property = null
    
    if (conversation?.property_id) {
      const { data: prop } = await supabase
        .from('cohost_properties')
        .select('*')
        .eq('id', conversation.property_id)
        .single()
      
      if (prop) {
        property = prop
        propertyContext = buildPropertyContext(prop)
      }
    }

    // 3. Get workspace prompt profile
    const { data: promptProfile } = await supabase
      .from('cohost_prompt_profiles')
      .select('system_instructions')
      .eq('workspace_id', workspaceId)
      .single()

    // 4. Get recent training examples for this workspace (for style learning)
    const { data: trainingExamples } = await supabase
      .from('cohost_training_data')
      .select('guest_message, final_response, category')
      .eq('workspace_id', workspaceId)
      .eq('was_edited', true)
      .order('created_at', { ascending: false })
      .limit(5)

    // 5. Build the system prompt
    const systemPrompt = buildSystemPrompt({
      customInstructions: promptProfile?.system_instructions || '',
      propertyContext,
      trainingExamples: trainingExamples || [],
      guestName: conversation?.guest_name || 'Guest',
    })

    // 6. Call OpenAI to classify and generate response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.body },
      ],
      functions: [
        {
          name: 'respond_to_guest',
          description: 'Classify the message and generate a response',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: CATEGORIES,
                description: 'The category of the guest message',
              },
              response: {
                type: 'string',
                description: 'The response to send to the guest',
              },
              requires_human_review: {
                type: 'boolean',
                description: 'Whether this message should be escalated to a human',
              },
              escalation_reason: {
                type: 'string',
                description: 'If requires_human_review is true, explain why',
              },
            },
            required: ['category', 'response', 'requires_human_review'],
          },
        },
      ],
      function_call: { name: 'respond_to_guest' },
      temperature: 0.7,
      max_tokens: 1000,
    })

    // 7. Parse the response
    const functionCall = completion.choices[0]?.message?.function_call
    if (!functionCall?.arguments) {
      throw new Error('No response generated')
    }

    const result = JSON.parse(functionCall.arguments)
    const category = result.category as MessageCategory
    const riskLevel = CATEGORY_RISK[category] || 'med'

    // 8. Update message with category and risk
    await supabase
      .from('cohost_messages')
      .update({
        category,
        risk_score: riskLevel === 'low' ? 25 : riskLevel === 'med' ? 50 : 75,
        status: 'drafted',
      })
      .eq('id', messageId)

    // 9. Save the draft
    const { data: draft, error: draftError } = await supabase
      .from('cohost_drafts')
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        model: 'gpt-4o-mini',
        draft_text: result.response,
        risk_level: riskLevel,
        recommended_action: result.requires_human_review ? 'escalate' : 'send',
      })
      .select('id, draft_text, risk_level, recommended_action')
      .single()

    if (draftError) {
      console.error('Failed to save draft:', draftError)
      return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
    }

    // 10. Log audit action
    await supabase.from('cohost_actions_audit').insert({
      workspace_id: workspaceId,
      message_id: messageId,
      action_type: 'draft_generated',
      meta: {
        model: 'gpt-4o-mini',
        category,
        risk_level: riskLevel,
        requires_human_review: result.requires_human_review,
      },
    })

    return NextResponse.json({
      success: true,
      draft: {
        id: draft.id,
        text: draft.draft_text,
        risk_level: draft.risk_level,
        recommended_action: draft.recommended_action,
        category,
        requires_human_review: result.requires_human_review,
        escalation_reason: result.escalation_reason,
      },
    })
  } catch (error) {
    console.error('Generate draft error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate draft' },
      { status: 500 }
    )
  }
}

// === HELPER FUNCTIONS ===

function buildPropertyContext(property: any): string {
  const parts: string[] = []
  
  parts.push(`Property: ${property.name}`)
  
  if (property.address) {
    parts.push(`Address: ${property.address}`)
  }
  
  if (property.check_in_time) {
    parts.push(`Check-in time: ${formatTime(property.check_in_time)}`)
  }
  
  if (property.check_out_time) {
    parts.push(`Check-out time: ${formatTime(property.check_out_time)}`)
  }
  
  if (property.wifi_name) {
    parts.push(`WiFi Network: ${property.wifi_name}`)
    if (property.wifi_password) {
      parts.push(`WiFi Password: ${property.wifi_password}`)
    }
  }
  
  if (property.parking_info) {
    parts.push(`Parking: ${property.parking_info}`)
  }
  
  if (property.house_rules) {
    parts.push(`House Rules: ${property.house_rules}`)
  }
  
  if (property.emergency_contact) {
    parts.push(`Emergency Contact: ${property.emergency_contact}`)
  }
  
  if (property.special_instructions) {
    parts.push(`Special Instructions: ${property.special_instructions}`)
  }
  
  return parts.join('\n')
}

function formatTime(time: string): string {
  try {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  } catch {
    return time
  }
}

function buildSystemPrompt({
  customInstructions,
  propertyContext,
  trainingExamples,
  guestName,
}: {
  customInstructions: string
  propertyContext: string
  trainingExamples: any[]
  guestName: string
}): string {
  let prompt = `You are a helpful, friendly, and professional vacation rental host assistant. Your job is to respond to guest messages in a warm, concise manner.

GUIDELINES:
- Be friendly and professional
- Keep responses concise but complete
- Use the guest's name when appropriate
- Provide specific information when available
- If you don't know something, say so politely
- For complaints or issues, show empathy first
- For emergencies, prioritize guest safety

GUEST NAME: ${guestName}
`

  if (propertyContext) {
    prompt += `
PROPERTY INFORMATION:
${propertyContext}
`
  }

  if (customInstructions) {
    prompt += `
HOST'S CUSTOM INSTRUCTIONS:
${customInstructions}
`
  }

  if (trainingExamples && trainingExamples.length > 0) {
    prompt += `
EXAMPLES OF HOW THE HOST PREFERS TO RESPOND:
`
    trainingExamples.forEach((ex, i) => {
      prompt += `
Example ${i + 1}:
Guest: ${ex.guest_message.substring(0, 200)}
Host response: ${ex.final_response.substring(0, 300)}
`
    })
  }

  prompt += `
INSTRUCTIONS:
1. Classify the guest's message into a category
2. Generate an appropriate response
3. Determine if this needs human review (complaints, refund requests, safety issues, angry guests)

Respond using the respond_to_guest function.
`

  return prompt
}