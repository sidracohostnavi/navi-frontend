// /lib/connectors/lodgify/sendMessage.ts
// Lodgify API connector for sending messages

import { SendMessageInput, SendMessageResult } from '../types'

const LODGIFY_API_BASE = 'https://api.lodgify.com/v2'

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { apiKey, reservationId, message } = input
  
  if (!apiKey) {
    return { ok: false, error: 'Lodgify API key is not configured' }
  }
  
  if (!reservationId) {
    return { ok: false, error: 'Reservation ID is missing' }
  }
  
  if (!message) {
    return { ok: false, error: 'Message body is empty' }
  }
  
  try {
    const url = `${LODGIFY_API_BASE}/reservations/${reservationId}/messages`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ApiKey': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ message })
    })
    
    // Lodgify returns 200 or 201 on success
    if (response.ok) {
      // Try to get the message ID from response
      let externalMessageId: string | undefined
      try {
        const data = await response.json()
        externalMessageId = data.id?.toString() || data.message_id?.toString()
      } catch {
        // Response might not have JSON body, that's ok
      }
      
      return { 
        ok: true, 
        externalMessageId 
      }
    }
    
    // Handle errors
    let errorMessage = `Lodgify API error: ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch {
      // Couldn't parse error response
    }
    
    // Specific error handling
    if (response.status === 401) {
      return { ok: false, error: 'Invalid Lodgify API key' }
    }
    if (response.status === 404) {
      return { ok: false, error: 'Reservation not found in Lodgify' }
    }
    if (response.status === 403) {
      return { ok: false, error: 'Not authorized to send messages for this reservation' }
    }
    
    return { ok: false, error: errorMessage }
    
  } catch (error) {
    console.error('Lodgify sendMessage error:', error)
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Failed to connect to Lodgify API' 
    }
  }
}