// /app/cohost/messaging/messages/[id]/page.tsx
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/auth'

interface MessageDetail {
  id: string
  body: string
  status: string
  category: string | null
  risk_score: number | null
  received_at: string
  direction: string
  workspace_id: string
  cohost_conversations: {
    id: string
    guest_name: string | null
    pms_type: string
    external_conversation_id: string
    cohost_properties: {
      id: string
      name: string
      address: string | null
    } | null
  }
}

interface Draft {
  id: string
  draft_text: string
  risk_level: string
  recommended_action: string | null
  created_at: string
}

export default function MessageDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id: messageId } = use(params)
  const { user, workspaceId } = useAuth()
  const router = useRouter()
  
  const [message, setMessage] = useState<MessageDetail | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editedText, setEditedText] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  const supabase = createBrowserClient()

  useEffect(() => {
    if (messageId && workspaceId) {
      loadMessage()
    }
  }, [messageId, workspaceId])

  async function loadMessage() {
    setLoading(true)
    
    // Load message
    const { data: msg, error: msgError } = await supabase
      .from('cohost_messages')
      .select(`
        id,
        body,
        status,
        category,
        risk_score,
        received_at,
        direction,
        workspace_id,
        cohost_conversations (
          id,
          guest_name,
          pms_type,
          external_conversation_id,
          cohost_properties (
            id,
            name,
            address
          )
        )
      `)
      .eq('id', messageId)
      .single()
    
    if (msgError || !msg) {
      setError('Message not found')
      setLoading(false)
      return
    }
    
    setMessage(msg as unknown as MessageDetail)
    
    // Load existing draft if any
    const { data: existingDraft } = await supabase
      .from('cohost_drafts')
      .select('id, draft_text, risk_level, recommended_action, created_at')
      .eq('message_id', messageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (existingDraft) {
      setDraft(existingDraft)
      setEditedText(existingDraft.draft_text)
    }
    
    setLoading(false)
  }

  async function handleGenerateDraft() {
    setGenerating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/cohost/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate draft')
      }
      
      setDraft({
        id: data.draft.id,
        draft_text: data.draft.text,
        risk_level: data.draft.risk_level,
        recommended_action: data.draft.recommended_action,
        created_at: new Date().toISOString(),
      })
      setEditedText(data.draft.text)
      
      // Reload message to get updated status
      loadMessage()
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft')
    }
    
    setGenerating(false)
  }

  async function handleSend() {
    if (!editedText.trim()) {
      setError('Response cannot be empty')
      return
    }
    
    setSending(true)
    setError(null)
    
    try {
      const response = await fetch('/api/cohost/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          draftId: draft?.id,
          finalText: editedText,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }
      
      setSuccess('Message sent successfully!')
      
      // Redirect after short delay
      setTimeout(() => {
        router.push('/cohost/messaging/inbox')
      }, 1500)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
    
    setSending(false)
  }

  async function handleEscalate() {
    setEscalating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/cohost/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          userId: user?.id,
          reason: 'Manually escalated for review',
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to escalate')
      }
      
      setSuccess('Message escalated for review')
      loadMessage()
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to escalate')
    }
    
    setEscalating(false)
  }

  function getRiskBadge(level: string) {
    const styles: Record<string, string> = {
      low: 'bg-green-100 text-green-800',
      med: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800',
    }
    return styles[level] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-48 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!message) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error || 'Message not found'}</p>
          <button
            onClick={() => router.push('/cohost/messaging/inbox')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Back to Inbox
          </button>
        </div>
      </div>
    )
  }

  const conversation = message.cohost_conversations
  const property = conversation?.cohost_properties
  const isSent = message.status === 'sent'
  const isEscalated = message.status === 'escalated'

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/cohost/messaging/inbox')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Inbox
      </button>
      
      {/* Status messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}
      
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {conversation?.guest_name || 'Unknown Guest'}
            </h1>
            {property && (
              <p className="text-gray-600">{property.name}</p>
            )}
            <div className="flex items-center space-x-2 mt-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                {conversation?.pms_type}
              </span>
              {message.category && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {message.category.replace('_', ' ')}
                </span>
              )}
              <span className={`text-xs px-2 py-1 rounded ${
                isSent ? 'bg-green-100 text-green-800' :
                isEscalated ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {message.status}
              </span>
            </div>
          </div>
          <span className="text-sm text-gray-500">
            {new Date(message.received_at).toLocaleString()}
          </span>
        </div>
        
        {/* Guest message */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-1">Guest Message:</p>
          <p className="text-gray-900 whitespace-pre-wrap">{message.body}</p>
        </div>
      </div>
      
      {/* Draft / Response section */}
      {!isSent && !isEscalated && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Your Response</h2>
            {draft && (
              <span className={`text-xs px-2 py-1 rounded ${getRiskBadge(draft.risk_level)}`}>
                {draft.risk_level} risk
              </span>
            )}
          </div>
          
          {!draft ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">Generate an AI draft response</p>
              <button
                onClick={handleGenerateDraft}
                disabled={generating}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </span>
                ) : 'Generate Draft'}
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Edit your response..."
              />
              
              <div className="flex justify-between items-center mt-4">
                <div className="flex space-x-3">
                  <button
                    onClick={handleGenerateDraft}
                    disabled={generating}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    {generating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                  <button
                    onClick={handleEscalate}
                    disabled={escalating}
                    className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    {escalating ? 'Escalating...' : 'Escalate'}
                  </button>
                </div>
                
                <button
                  onClick={handleSend}
                  disabled={sending || !editedText.trim()}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {sending ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </span>
                  ) : 'Approve & Send'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      
      {/* Sent message display */}
      {isSent && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <svg className="w-6 h-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <h2 className="text-lg font-semibold text-green-800">Message Sent</h2>
          </div>
          <p className="text-green-700">This message has been sent to the guest.</p>
        </div>
      )}
      
      {/* Escalated message display */}
      {isEscalated && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <svg className="w-6 h-6 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-lg font-semibold text-red-800">Escalated for Review</h2>
          </div>
          <p className="text-red-700">This message has been escalated and requires human attention.</p>
        </div>
      )}
    </div>
  )
}