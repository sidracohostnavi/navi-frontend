// /lib/connectors/hospitable/index.ts
// Complete Hospitable API connector

import {
  SendMessageInput,
  SendMessageResult,
  GetConversationsResult,
  GetMessagesResult,
  PmsConversation,
  PmsMessage,
} from '../types'

const API_BASE = 'https://api.hospitable.com/v1'

/**
 * Hospitable uses Personal Access Tokens (PAT) - no OAuth flow needed
 * The token is passed directly as accessToken
 */

/**
 * Get list of conversations
 */
export async function getConversations(
  accessToken: string,
  limit: number = 50
): Promise<GetConversationsResult> {
  try {
    const response = await fetch(
      `${API_BASE}/conversations?per_page=${limit}&sort=-last_message_at`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Invalid or expired access token' }
      }
      return { ok: false, error: `Hospitable API error: ${response.status}` }
    }

    const data = await response.json()
    const items = data.data || []

    const conversations: PmsConversation[] = items.map((item: any) => ({
      id: String(item.id),
      reservationId: item.reservation_id ? String(item.reservation_id) : undefined,
      propertyId: item.property_id ? String(item.property_id) : undefined,
      guestName: item.guest?.name || item.guest_name || undefined,
      guestEmail: item.guest?.email || undefined,
      lastMessageAt: item.last_message_at || undefined,
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
      `${API_BASE}/conversations/${conversationId}/messages?per_page=${limit}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
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
      return { ok: false, error: `Hospitable API error: ${response.status}` }
    }

    const data = await response.json()
    const items = data.data || []

    const messages: PmsMessage[] = items.map((item: any) => ({
      id: String(item.id),
      conversationId: conversationId,
      body: item.body || item.content || '',
      isFromGuest: item.direction === 'inbound' || item.from === 'guest' || item.is_from_guest === true,
      sentAt: item.sent_at || item.created_at || new Date().toISOString(),
      senderName: item.sender_name || undefined,
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
      return { ok: false, error: `Hospitable API error: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    const messageId = data.id || data.data?.id

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