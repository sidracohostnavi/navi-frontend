// /lib/connectors/hostaway/sendMessage.ts
// Hostaway API connector for sending messages

import { SendMessageInput, SendMessageResult } from '../types'

const HOSTAWAY_API_BASE = 'https://api.hostaway.com/v1'

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { apiKey, reservationId, message } = input
  
  // Note: For Hostaway, apiKey is the Bearer access token
  // reservationId is actually the conversationId in Hostaway's API
  if (!apiKey) {
    return { ok: false, error: 'Hostaway access token is not configured' }
  }
  
  if (!reservationId) {
    return { ok: false, error: 'Conversation ID is missing' }
  }
  
  if (!message) {
    return { ok: false, error: 'Message body is empty' }
  }
  
  try {
    const url = `${HOSTAWAY_API_BASE}/conversations/${reservationId}/messages`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ body: message })
    })
    
    if (response.ok) {
      let externalMessageId: string | undefined
      try {
        const data = await response.json()
        externalMessageId = data.result?.id?.toString() || data.id?.toString()
      } catch {
        // Response might not have JSON body
      }
      
      return { 
        ok: true, 
        externalMessageId 
      }
    }
    
    let errorMessage = `Hostaway API error: ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch {
      // Couldn't parse error response
    }
    
    if (response.status === 401) {
      return { ok: false, error: 'Invalid Hostaway access token' }
    }
    if (response.status === 404) {
      return { ok: false, error: 'Conversation not found in Hostaway' }
    }
    if (response.status === 403) {
      return { ok: false, error: 'Not authorized to send messages for this conversation' }
    }
    
    return { ok: false, error: errorMessage }
    
  } catch (error) {
    console.error('Hostaway sendMessage error:', error)
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Failed to connect to Hostaway API' 
    }
  }
}