// /lib/connectors/lodgify/getMessages.ts
// Fetch messages from Lodgify API

export interface LodgifyReservation {
  id: number
  guest: {
    name: string
    email?: string
  }
  property_id: number
  arrival: string
  departure: string
  status: string
}

export interface LodgifyMessage {
  id: number
  body: string
  created_at: string
  type: 'guest' | 'host' | 'system'
  sender?: string
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

const LODGIFY_API_BASE = 'https://api.lodgify.com/v2'

// Get recent reservations (last 30 days check-in or currently staying)
export async function getRecentReservations(apiKey: string): Promise<GetReservationsResult> {
  if (!apiKey) {
    return { ok: false, error: 'Lodgify API key is not configured' }
  }

  try {
    // Get reservations from last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const dateFrom = thirtyDaysAgo.toISOString().split('T')[0]
    
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const dateTo = thirtyDaysFromNow.toISOString().split('T')[0]

    const url = `${LODGIFY_API_BASE}/reservations?dateFrom=${dateFrom}&dateTo=${dateTo}&includeCount=false`

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

    return { ok: true, reservations }

  } catch (error) {
    console.error('Lodgify getRecentReservations error:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch reservations'
    }
  }
}

// Get messages for a specific reservation
export async function getReservationMessages(
  apiKey: string,
  reservationId: number | string
): Promise<GetMessagesResult> {
  if (!apiKey) {
    return { ok: false, error: 'Lodgify API key is not configured' }
  }

  try {
    const url = `${LODGIFY_API_BASE}/reservations/${reservationId}/messages`

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
        return { ok: false, error: 'Reservation not found' }
      }
      return { ok: false, error: `Lodgify API error: ${response.status}` }
    }

    const data = await response.json()
    
    // Lodgify returns { items: [...] } or just an array
    const messages = Array.isArray(data) ? data : (data.items || [])

    return { ok: true, messages }

  } catch (error) {
    console.error('Lodgify getReservationMessages error:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch messages'
    }
  }
}