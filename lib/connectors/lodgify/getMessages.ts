// /lib/connectors/lodgify/getMessages.ts
// Fetch messages from Lodgify API

export interface LodgifyReservation {
  id: number
  guest: {
    first_name?: string
    last_name?: string
    name?: string
    full_name?: string
    email?: string
  }
  property_id: number
  property_name?: string
  arrival: string
  departure: string
  status: string
  thread_uid?: string
}

export interface LodgifyMessage {
  id: number
  body?: string
  text?: string
  message?: string
  created_at?: string
  sent_at?: string
  type?: string
  sender?: string
  is_from_guest?: boolean
  thread_uid?: string
  direction?: string
}

export interface GetReservationsResult {
  ok: boolean
  reservations?: LodgifyReservation[]
  error?: string
}

export interface GetMessagesResult {
  ok: boolean
  messages?: LodgifyMessage[]
  error?: string
}

const LODGIFY_API_BASE = 'https://api.lodgify.com/v1'

// Get all reservations
export async function getRecentReservations(apiKey: string): Promise<GetReservationsResult> {
  if (!apiKey) {
    return { ok: false, error: 'Lodgify API key is not configured' }
  }

  try {
    const url = `${LODGIFY_API_BASE}/reservation`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-ApiKey': apiKey,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Invalid Lodgify API key' }
      }
      return { ok: false, error: `Lodgify API error: ${response.status}` }
    }

    const data = await response.json()
    
    // Lodgify returns { items: [...] } or just an array
    const reservations = Array.isArray(data) ? data : (data.items || [])

    // Transform guest data to consistent format
    const transformedReservations = reservations.map((r: any) => ({
      ...r,
      guest: {
        ...r.guest,
        name: r.guest?.full_name || r.guest?.name || 
              `${r.guest?.first_name || ''} ${r.guest?.last_name || ''}`.trim() || 
              'Unknown Guest'
      }
    }))

    return { ok: true, reservations: transformedReservations }

  } catch (error) {
    console.error('Lodgify getRecentReservations error:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch reservations'
    }
  }
}

// Get messages for a specific reservation using thread_uid
export async function getReservationMessages(
  apiKey: string,
  reservationId: number | string,
  threadUid?: string
): Promise<GetMessagesResult> {
  if (!apiKey) {
    return { ok: false, error: 'Lodgify API key is not configured' }
  }

  try {
    // Try to get messages using the reservation's thread
    // Lodgify uses thread_uid for message threads
    const url = threadUid 
      ? `${LODGIFY_API_BASE}/reservation/message/${threadUid}`
      : `${LODGIFY_API_BASE}/reservation/${reservationId}/messages`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-ApiKey': apiKey,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Invalid Lodgify API key' }
      }
      if (response.status === 404) {
        // No messages for this reservation - that's OK
        return { ok: true, messages: [] }
      }
      return { ok: false, error: `Lodgify API error: ${response.status}` }
    }

    const data = await response.json()
    
    // Lodgify returns { items: [...] } or just an array
    const messages = Array.isArray(data) ? data : (data.items || data.messages || [])

    return { ok: true, messages }

  } catch (error) {
    console.error('Lodgify getReservationMessages error:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch messages'
    }
  }
}