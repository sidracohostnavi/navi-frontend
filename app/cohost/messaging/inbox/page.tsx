// /app/cohost/messaging/inbox/page.tsx
import Link from 'next/link'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import InboxFilters from './InboxFilters'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = createCohostServiceClient()
  
  const { data: messages, error } = await supabase
    .from('cohost_messages')
    .select(`
      id,
      body,
      status,
      direction,
      received_at,
      conversation_id,
      cohost_conversations (
        id,
        guest_name,
        pms_type
      ),
      cohost_drafts (
        id,
        risk_level
      )
    `)
    .eq('direction', 'inbound')
    .order('received_at', { ascending: false })
    .limit(50)
  
  if (error) {
    console.error('Error fetching messages:', error)
  }

  const filteredMessages = messages || []

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Message Inbox</h1>
          <p className="text-gray-600">Review and respond to guest messages</p>
        </div>
        
        <InboxFilters />
        
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredMessages.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No messages found. Messages will appear here when guests contact you.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredMessages.map((message: any) => {
                const conversation = message.cohost_conversations
                const latestDraft = message.cohost_drafts?.[0]
                
                const statusStyle = getStatusStyle(message.status)
                const riskStyle = latestDraft ? getRiskStyle(latestDraft.risk_level) : ''
                
                return (
                  <li key={message.id}>
                    <Link
                      href={`/cohost/messaging/messages/${message.id}`}
                      className="block hover:bg-gray-50 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">
                              {conversation?.guest_name || 'Unknown Guest'}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              {conversation?.pms_type || 'unknown'}
                            </span>
                          </div>
                          
                          <p className="text-sm text-gray-600 truncate">
                            {message.body?.substring(0, 100) || 'No message content'}
                            {message.body?.length > 100 ? '...' : ''}
                          </p>
                          
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(message.received_at).toLocaleString()}
                          </p>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1 ml-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>
                            {message.status}
                          </span>
                          {latestDraft && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${riskStyle}`}>
                              {latestDraft.risk_level} risk
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function getStatusStyle(status: string): string {
  const styles: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    drafted: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    sent: 'bg-gray-100 text-gray-800',
    escalated: 'bg-red-100 text-red-800'
  }
  return styles[status] || styles.new
}

function getRiskStyle(risk: string): string {
  const styles: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    med: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800'
  }
  return styles[risk] || styles.low
}