// lib/supabase/cohostTypes.ts
// TypeScript types for CoHost Messaging multi-tenant data model

// === ENUMS ===
export type PmsType = 'lodgify' | 'guesty' | 'hostaway'
export type MessageDirection = 'inbound' | 'outbound'
export type RiskLevel = 'low' | 'med' | 'high'
export type TicketStatus = 'new' | 'drafted' | 'approved' | 'sent' | 'escalated'
export type WorkspaceRole = 'owner' | 'admin' | 'operator'
export type ActionType = 
  | 'webhook_ingested' 
  | 'draft_generated' 
  | 'draft_edited' 
  | 'approved' 
  | 'sent' 
  | 'escalated' 
  | 'marked_sent'

// === ROW TYPES ===
export interface CohostWorkspace {
  id: string
  name: string
  created_at: string
}

export interface CohostWorkspaceMember {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  created_at: string
}

export interface CohostProperty {
  id: string
  workspace_id: string
  name: string
  address: string | null
  created_at: string
}

export interface CohostPromptProfile {
  id: string
  workspace_id: string
  system_instructions: string
  created_at: string
  updated_at: string
}

export interface CohostPropertyPromptOverride {
  id: string
  property_id: string
  workspace_id: string
  override_instructions: string
}

export interface CohostPmsAccount {
  id: string
  workspace_id: string
  pms_type: PmsType
  credentials_json: Record<string, unknown>
  webhook_secret: string
  created_at: string
}

export interface CohostConversation {
  id: string
  workspace_id: string
  pms_type: PmsType
  external_conversation_id: string
  property_id: string | null
  guest_name: string | null
  created_at: string
}

export interface CohostMessage {
  id: string
  workspace_id: string
  conversation_id: string
  direction: MessageDirection
  body: string
  external_message_id: string | null
  raw_payload: Record<string, unknown>
  status: TicketStatus
  received_at: string
}

export interface CohostDraft {
  id: string
  workspace_id: string
  message_id: string
  model: string
  draft_text: string
  risk_level: RiskLevel
  recommended_action: string | null
  created_at: string
}

export interface CohostActionAudit {
  id: string
  workspace_id: string
  message_id: string
  action_type: ActionType
  actor_user_id: string | null
  meta: Record<string, unknown>
  created_at: string
}