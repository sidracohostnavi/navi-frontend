// /lib/connectors/types.ts
// Shared types for all PMS connectors

export interface SendMessageInput {
  apiKey: string
  reservationId: string
  message: string
}

export interface SendMessageResult {
  ok: boolean
  externalMessageId?: string
  error?: string
}

export interface PmsConnector {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>
}