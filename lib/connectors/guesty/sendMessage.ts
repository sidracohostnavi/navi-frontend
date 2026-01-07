// /lib/connectors/guesty/sendMessage.ts
// Guesty API connector for sending messages

import { SendMessageInput, SendMessageResult } from '../types'

const GUESTY_API_BASE = 'https://api.guesty.com/api/v2'

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { apiKey, reservationId, message } = input
  
  // Note: For Guesty, apiKey is actually the Bearer access token
  if (!apiKey) {
    return { ok: false, error: 'Guesty access token is not configured' }
  }
  
  if (!reservationId) {
    return { ok: false, error: 'Reservation ID is missing' }
  }
  
  if (!message) {
    return { ok: false, error: 'Message body is empty' }
  }
  
  try {
    const url = `${GUESTY_API_BASE}/reservations/${reservationId}/messages`
    
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
        externalMessageId = data._id || data.id?.toString()
      } catch {
        // Response might not have JSON body
      }
      
      return { 
        ok: true, 
        externalMessageId 
      }
    }
    
    let errorMessage = `Guesty API error: ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch {
      // Couldn't parse error response
    }
    
    if (response.status === 401) {
      return { ok: false, error: 'Invalid Guesty access token' }
    }
    if (response.status === 404) {
      return { ok: false, error: 'Reservation not found in Guesty' }
    }
    if (response.status === 403) {
      return { ok: false, error: 'Not authorized to send messages for this reservation' }
    }
    
    return { ok: false, error: errorMessage }
    
  } catch (error) {
    console.error('Guesty sendMessage error:', error)
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Failed to connect to Guesty API' 
    }
  }
}