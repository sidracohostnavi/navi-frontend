// /lib/connectors/types.ts
// Shared types for all PMS connectors

export type PmsType = 'hostaway' | 'guesty' | 'hospitable'

// === SEND MESSAGE ===
export interface SendMessageInput {
  accessToken: string
  conversationId: string
  message: string
}

export interface SendMessageResult {
  ok: boolean
  externalMessageId?: string
  error?: string
}

// === GET CONVERSATIONS ===
export interface PmsConversation {
  id: string
  reservationId?: string
  propertyId?: string
  guestName?: string
  guestEmail?: string
  lastMessageAt?: string
}

export interface GetConversationsResult {
  ok: boolean
  conversations?: PmsConversation[]
  error?: string
}

// === GET MESSAGES ===
export interface PmsMessage {
  id: string
  conversationId: string
  body: string
  isFromGuest: boolean
  sentAt: string
  senderName?: string
}

export interface GetMessagesResult {
  ok: boolean
  messages?: PmsMessage[]
  error?: string
}

// === AUTH ===
export interface AuthResult {
  ok: boolean
  accessToken?: string
  expiresAt?: string
  error?: string
}

// === CONNECTOR INTERFACE ===
export interface PmsConnector {
  getAccessToken?(credentials: Record<string, string>): Promise<AuthResult>
  getConversations(accessToken: string, limit?: number): Promise<GetConversationsResult>
  getMessages(accessToken: string, conversationId: string): Promise<GetMessagesResult>
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>
}