// /lib/connectors/index.ts
// Main router for PMS connectors

import { PmsType, SendMessageInput, SendMessageResult, GetConversationsResult, GetMessagesResult } from './types'
import * as hostaway from './hostaway'
import * as guesty from './guesty'
import * as hospitable from './hospitable'

/**
 * Send a message via the appropriate PMS connector
 */
export async function sendMessageViaPms(
  pmsType: PmsType,
  input: SendMessageInput
): Promise<SendMessageResult> {
  switch (pmsType) {
    case 'hostaway':
      return hostaway.sendMessage(input)
    case 'guesty':
      return guesty.sendMessage(input)
    case 'hospitable':
      return hospitable.sendMessage(input)
    default:
      return { ok: false, error: `Unsupported PMS type: ${pmsType}` }
  }
}

/**
 * Get conversations from a PMS
 */
export async function getConversationsFromPms(
  pmsType: PmsType,
  accessToken: string,
  limit?: number
): Promise<GetConversationsResult> {
  switch (pmsType) {
    case 'hostaway':
      return hostaway.getConversations(accessToken, limit)
    case 'guesty':
      return guesty.getConversations(accessToken, limit)
    case 'hospitable':
      return hospitable.getConversations(accessToken, limit)
    default:
      return { ok: false, error: `Unsupported PMS type: ${pmsType}` }
  }
}

/**
 * Get messages for a conversation from a PMS
 */
export async function getMessagesFromPms(
  pmsType: PmsType,
  accessToken: string,
  conversationId: string,
  limit?: number
): Promise<GetMessagesResult> {
  switch (pmsType) {
    case 'hostaway':
      return hostaway.getMessages(accessToken, conversationId, limit)
    case 'guesty':
      return guesty.getMessages(accessToken, conversationId, limit)
    case 'hospitable':
      return hospitable.getMessages(accessToken, conversationId, limit)
    default:
      return { ok: false, error: `Unsupported PMS type: ${pmsType}` }
  }
}

// Re-export types
export * from './types'