// lib/supabase/cohostTypes.ts
// TypeScript types for CoHost V2 Messaging multi-tenant data model

// === ENUMS ===
export type PmsType = 'hostaway' | 'guesty' | 'hospitable'
export type MessageDirection = 'inbound' | 'outbound'
export type RiskLevel = 'low' | 'med' | 'high'
export type TicketStatus = 'new' | 'drafted' | 'approved' | 'sent' | 'escalated'
export type WorkspaceRole = 'owner' | 'admin' | 'operator'
export type AutomationLevel = 1 | 2 | 3
export type EscalationStatus = 'pending' | 'in_progress' | 'resolved' | 'closed'

export type ActionType = 
  | 'webhook_ingested' 
  | 'draft_generated' 
  | 'draft_edited' 
  | 'approved' 
  | 'sent' 
  | 'escalated' 
  | 'marked_sent'
  | 'auto_sent'

export type MessageCategory = 
  | 'check_in' 
  | 'check_out' 
  | 'wifi' 
  | 'parking' 
  | 'amenities'
  | 'noise_complaint' 
  | 'maintenance' 
  | 'refund_request'
  | 'directions' 
  | 'recommendations' 
  | 'emergency' 
  | 'general'

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
  external_property_id: string | null
  pms_type: PmsType | null
  timezone: string
  check_in_time: string
  check_out_time: string
  wifi_name: string | null
  wifi_password: string | null
  parking_info: string | null
  house_rules: string | null
  emergency_contact: string | null
  special_instructions: string | null
  vendor_contacts: VendorContact[]
  amenities: string[]
  created_at: string
  updated_at: string
}

export interface VendorContact {
  name: string
  role: string // e.g., 'cleaner', 'handyman', 'plumber'
  phone: string
  email?: string
  notes?: string
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
  category: MessageCategory | null
  risk_score: number | null
  auto_send_scheduled_at: string | null
  auto_send_cancelled: boolean
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

export interface CohostTrainingData {
  id: string
  workspace_id: string
  property_id: string | null
  message_id: string | null
  guest_message: string
  ai_draft: string
  final_response: string
  was_edited: boolean
  similarity_score: number | null
  category: MessageCategory | null
  created_at: string
}

export interface CohostAutomationSettings {
  id: string
  workspace_id: string
  automation_level: AutomationLevel
  always_require_approval: string[]
  auto_send_delay_minutes: number
  notify_on_escalation: boolean
  escalation_email: string | null
  slack_webhook_url: string | null
  created_at: string
  updated_at: string
}

export interface CohostEscalation {
  id: string
  workspace_id: string
  message_id: string
  escalated_by: string | null
  reason: string | null
  assigned_to: string | null
  status: EscalationStatus
  resolution_notes: string | null
  created_at: string
  resolved_at: string | null
}

export interface CohostUserPreferences {
  user_id: string
  workspace_id: string
  email_notifications: boolean
  slack_notifications: boolean
  assigned_property_ids: string[] | null
  can_approve: boolean
  can_manage_settings: boolean
  created_at: string
  updated_at: string
}

// === DATABASE SCHEMA TYPE ===
export interface CohostDatabase {
  public: {
    Tables: {
      cohost_workspaces: {
        Row: CohostWorkspace
        Insert: Omit<CohostWorkspace, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CohostWorkspace, 'id'>>
      }
      cohost_workspace_members: {
        Row: CohostWorkspaceMember
        Insert: Omit<CohostWorkspaceMember, 'created_at'> & { created_at?: string }
        Update: Partial<Omit<CohostWorkspaceMember, 'workspace_id' | 'user_id'>>
      }
      cohost_properties: {
        Row: CohostProperty
        Insert: Omit<CohostProperty, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<CohostProperty, 'id'>>
      }
      cohost_prompt_profiles: {
        Row: CohostPromptProfile
        Insert: Omit<CohostPromptProfile, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<CohostPromptProfile, 'id'>>
      }
      cohost_property_prompt_overrides: {
        Row: CohostPropertyPromptOverride
        Insert: Omit<CohostPropertyPromptOverride, 'id'> & { id?: string }
        Update: Partial<Omit<CohostPropertyPromptOverride, 'id'>>
      }
      cohost_pms_accounts: {
        Row: CohostPmsAccount
        Insert: Omit<CohostPmsAccount, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CohostPmsAccount, 'id'>>
      }
      cohost_conversations: {
        Row: CohostConversation
        Insert: Omit<CohostConversation, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CohostConversation, 'id'>>
      }
      cohost_messages: {
        Row: CohostMessage
        Insert: Omit<CohostMessage, 'id' | 'received_at'> & { id?: string; received_at?: string }
        Update: Partial<Omit<CohostMessage, 'id'>>
      }
      cohost_drafts: {
        Row: CohostDraft
        Insert: Omit<CohostDraft, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CohostDraft, 'id'>>
      }
      cohost_actions_audit: {
        Row: CohostActionAudit
        Insert: Omit<CohostActionAudit, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CohostActionAudit, 'id'>>
      }
      cohost_training_data: {
        Row: CohostTrainingData
        Insert: Omit<CohostTrainingData, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CohostTrainingData, 'id'>>
      }
      cohost_automation_settings: {
        Row: CohostAutomationSettings
        Insert: Omit<CohostAutomationSettings, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<CohostAutomationSettings, 'id'>>
      }
      cohost_escalations: {
        Row: CohostEscalation
        Insert: Omit<CohostEscalation, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CohostEscalation, 'id'>>
      }
      cohost_user_preferences: {
        Row: CohostUserPreferences
        Insert: Omit<CohostUserPreferences, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }
        Update: Partial<Omit<CohostUserPreferences, 'user_id'>>
      }
    }
  }
}