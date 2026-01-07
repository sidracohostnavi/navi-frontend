// /lib/connectors/hostaway/index.ts
// Complete Hostaway API connector

import {
  SendMessageInput,
  SendMessageResult,
  GetConversationsResult,
  GetMessagesResult,
  AuthResult,
  PmsConversation,
  PmsMessage,
} from '../types'

const API_BASE = 'https://api.hostaway.com/v1'

/**
 * Get OAuth access token using client credentials
 */
export async function getAccessToken(
  accountId: string,
  apiKey: string
): Promise<AuthResult> {
  try {
    const response = await fetch(`${API_BASE}/accessTokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: accountId,
        client_secret: apiKey,
        scope: 'general',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { ok: false, error: `Auth failed: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    return {
      ok: true,
      accessToken: data.access_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Auth request failed',
    }
  }
}

/**
 * Get list of conversations
 */
export async function getConversations(
  accessToken: string,
  limit: number = 50
): Promise<GetConversationsResult> {
  try {
    const response = await fetch(
      `${API_BASE}/conversations?limit=${limit}&orderBy=lastMessageDate&orderDirection=desc`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Invalid or expired access token' }
      }
      return { ok: false, error: `Hostaway API error: ${response.status}` }
    }

    const data = await response.json()
    const items = data.result || []

    const conversations: PmsConversation[] = items.map((item: any) => ({
      id: String(item.id),
      reservationId: item.reservationId ? String(item.reservationId) : undefined,
      propertyId: item.listingMapId ? String(item.listingMapId) : undefined,
      guestName: item.guestName || undefined,
      guestEmail: item.guestEmail || undefined,
      lastMessageAt: item.lastMessageDate || undefined,
    }))

    return { ok: true, conversations }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch conversations',
    }
  }
}

/**
 * Get messages for a specific conversation
 */
export async function getMessages(
  accessToken: string,
  conversationId: string,
  limit: number = 100
): Promise<GetMessagesResult> {
  try {
    const response = await fetch(
      `${API_BASE}/conversations/${conversationId}/messages?limit=${limit}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Invalid or expired access token' }
      }
      if (response.status === 404) {
        return { ok: true, messages: [] }
      }
      return { ok: false, error: `Hostaway API error: ${response.status}` }
    }

    const data = await response.json()
    const items = data.result || []

    const messages: PmsMessage[] = items.map((item: any) => ({
      id: String(item.id),
      conversationId: conversationId,
      body: item.body || '',
      isFromGuest: item.isIncoming === 1 || item.isIncoming === true,
      sentAt: item.insertedOn || item.date || new Date().toISOString(),
      senderName: item.senderName || undefined,
    }))

    return { ok: true, messages }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch messages',
    }
  }
}

/**
 * Send a message to a conversation
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { accessToken, conversationId, message } = input

  if (!accessToken) {
    return { ok: false, error: 'Access token is required' }
  }
  if (!conversationId) {
    return { ok: false, error: 'Conversation ID is required' }
  }
  if (!message || message.trim() === '') {
    return { ok: false, error: 'Message body cannot be empty' }
  }

  try {
    const response = await fetch(
      `${API_BASE}/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: message }),
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Invalid or expired access token' }
      }
      if (response.status === 404) {
        return { ok: false, error: 'Conversation not found' }
      }
      const errorText = await response.text()
      return { ok: false, error: `Hostaway API error: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    const messageId = data.result?.id || data.id

    return {
      ok: true,
      externalMessageId: messageId ? String(messageId) : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    }
  }
}