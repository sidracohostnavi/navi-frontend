// /app/cohost/messaging/messages/[id]/page.tsx
import Link from 'next/link'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import { notFound } from 'next/navigation'
import MessageActions from './MessageActions'

export const dynamic = 'force-dynamic'

export default async function MessageDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createCohostServiceClient()
  
  const { data: message, error } = await supabase
    .from('cohost_messages')
    .select(`
      id,
      workspace_id,
      conversation_id,
      direction,
      body,
      status,
      raw_payload,
      received_at,
      external_message_id,
      cohost_conversations (
        id,
        guest_name,
        pms_type,
        external_conversation_id,
        property_id
      ),
      cohost_drafts (
        id,
        draft_text,
        risk_level,
        recommended_action,
        model,
        created_at
      ),
      cohost_actions_audit (
        id,
        action_type,
        actor_user_id,
        meta,
        created_at
      )
    `)
    .eq('id', id)
    .single()
  
  if (error || !message) {
    console.error('Error fetching message:', error)
    notFound()
  }
  
  const conversation = message.cohost_conversations as any
  const drafts = (message.cohost_drafts as any[]) || []
  const auditLog = (message.cohost_actions_audit as any[]) || []
  const latestDraft = drafts.sort((a: any, b: any) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]

  const statusStyles: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    drafted: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    sent: 'bg-gray-100 text-gray-800',
    escalated: 'bg-red-100 text-red-800'
  }

  const actionIcons: Record<string, string> = {
    webhook_ingested: '📥',
    draft_generated: '🤖',
    draft_edited: '✏️',
    approved: '✅',
    sent: '📤',
    escalated: '🚨',
    marked_sent: '☑️'
  }

  const actionLabels: Record<string, string> = {
    webhook_ingested: 'Message received',
    draft_generated: 'AI draft generated',
    draft_edited: 'Draft edited',
    approved: 'Reply approved',
    sent: 'Reply sent',
    escalated: 'Escalated to admin',
    marked_sent: 'Marked as sent'
  }

  const guestName = conversation?.guest_name || 'Unknown Guest'
  const pmsType = conversation?.pms_type || 'unknown'
  const messageDate = new Date(message.received_at).toLocaleString()
  const statusStyle = statusStyles[message.status] || statusStyles.new
  const statusLabel = message.status.charAt(0).toUpperCase() + message.status.slice(1)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <Link 
          href="/cohost/messaging/inbox"
          className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block"
        >
          ← Back to Inbox
        </Link>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{guestName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  {pmsType}
                </span>
                <span className="text-sm text-gray-500">{messageDate}</span>
              </div>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusStyle}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Guest Message
          </h2>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-800 whitespace-pre-wrap">{message.body}</p>
          </div>
        </div>
        
        <MessageActions 
          messageId={message.id}
          workspaceId={message.workspace_id}
          conversationId={message.conversation_id}
          currentStatus={message.status}
          draftText={latestDraft?.draft_text || ''}
          draftRiskLevel={latestDraft?.risk_level || null}
          draftRecommendation={latestDraft?.recommended_action || null}
          pmsType={conversation?.pms_type || 'lodgify'}
        />
        
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Activity Log
          </h2>
          {auditLog.length === 0 ? (
            <p className="text-gray-500 italic">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {auditLog
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((entry: any) => (
                  <li key={entry.id} className="flex items-center gap-2 text-sm">
                    <span>{actionIcons[entry.action_type] || '•'}</span>
                    <span className="text-gray-700">{actionLabels[entry.action_type] || entry.action_type}</span>
                    <span className="text-gray-400">{new Date(entry.created_at).toLocaleString()}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}