// /app/cohost/messaging/conversations/[id]/page.tsx
'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

interface ConversationDetail {
  id: string
  channel: 'gmail_relay' | 'direct_email'
  gmail_thread_id: string | null
  last_message_at: string | null
  unread_count: number
  bookings: {
    id: string
    guest_name: string | null
    enriched_guest_name: string | null
    check_in: string
    check_out: string
    source: string | null
  } | null
  cohost_properties: {
    id: string
    name: string
  } | null
}

interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  body: string
  sent_at: string
  sent_by_user_id: string | null
  is_read: boolean
}

interface AiDraft {
  id: string
  conversation_id: string
  draft_body: string
  status: 'pending' | 'approved' | 'edited' | 'dismissed'
  edited_body: string | null
  created_at: string
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: conversationId } = use(params)
  const { user, workspaceId } = useAuth()
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState<AiDraft | null>(null)
  const [draftEditText, setDraftEditText] = useState('')
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draftAction, setDraftAction] = useState<string | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deliveryWarning, setDeliveryWarning] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    if (conversationId && workspaceId) {
      loadConversation()
    }
  }, [conversationId, workspaceId])

  // Scroll to bottom when messages load or new message added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversation() {
    setLoading(true)

    // Load conversation with related booking + property
    const { data: conv, error: convError } = await supabase
      .from('cohost_conversations')
      .select(`
        id,
        channel,
        gmail_thread_id,
        last_message_at,
        unread_count,
        bookings (
          id,
          guest_name,
          enriched_guest_name,
          check_in,
          check_out,
          source
        ),
        cohost_properties (
          id,
          name
        )
      `)
      .eq('id', conversationId)
      .single()

    if (convError || !conv) {
      setError('Conversation not found')
      setLoading(false)
      return
    }

    setConversation(conv as unknown as ConversationDetail)

    // Load all messages
    const { data: msgs, error: msgsError } = await supabase
      .from('cohost_messages')
      .select('id, conversation_id, direction, body, sent_at, sent_by_user_id, is_read')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })

    if (msgsError) {
      console.error('Failed to load messages:', msgsError)
    } else {
      setMessages((msgs || []) as Message[])
    }

    // Load pending AI draft (most recent)
    const { data: pendingDraft } = await supabase
      .from('cohost_ai_drafts')
      .select('id, conversation_id, draft_body, status, edited_body, created_at')
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pendingDraft) {
      setDraft(pendingDraft as AiDraft)
      setDraftEditText(pendingDraft.draft_body)
    }

    // Mark conversation as read
    if (conv.unread_count > 0) {
      await supabase
        .from('cohost_conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId)

      await supabase
        .from('cohost_messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('is_read', false)
    }

    setLoading(false)
  }

  async function handleSend(bodyToSend?: string) {
    const text = (bodyToSend ?? replyText).trim()
    if (!text) return

    setSending(true)
    setError(null)
    setDeliveryWarning(null)

    const response = await fetch('/api/cohost/messaging/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        body: text,
        draft_id: draft?.id ?? null,
        edited: draft ? text !== draft.draft_body : false,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      setError(data.error || 'Failed to send message')
      setSending(false)
      return
    }

    // Append the stored message to the thread
    setMessages(prev => [...prev, data.message as Message])
    setReplyText('')
    setDraft(null)
    setSending(false)

    // Surface delivery failures as a warning (message is stored even if delivery failed)
    if (!data.delivered && data.delivery_error) {
      setDeliveryWarning(`Message saved but not delivered: ${data.delivery_error}`)
    }
  }

  async function handleDraftAction(action: 'approve' | 'edit' | 'dismiss') {
    if (!draft) return
    setDraftAction(action)

    if (action === 'approve') {
      // Send with original draft body
      await handleSend(draft.draft_body)
    } else if (action === 'edit') {
      // Send with edited text
      await handleSend(draftEditText)
    } else if (action === 'dismiss') {
      await supabase
        .from('cohost_ai_drafts')
        .update({ status: 'dismissed' })
        .eq('id', draft.id)
      setDraft(null)
    }

    setDraftAction(null)
  }

  async function handleGenerateDraft() {
    // Find the last inbound message to generate a draft for
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    if (!lastInbound) return

    setGeneratingDraft(true)
    setError(null)

    const response = await fetch('/api/cohost/messaging/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        message_id: lastInbound.id,
      }),
    })

    const data = await response.json()
    setGeneratingDraft(false)

    if (!response.ok) {
      setError(data.error || 'Failed to generate draft')
      return
    }

    setDraft({
      id: data.draft.id,
      conversation_id: conversationId,
      draft_body: data.draft.draft_body,
      status: 'pending',
      edited_body: null,
      created_at: new Date().toISOString(),
    })
    setDraftEditText(data.draft.draft_body)
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function getGuestName(conv: ConversationDetail) {
    const b = conv.bookings
    if (!b) return 'Unknown Guest'
    return b.enriched_guest_name || b.guest_name || 'Unknown Guest'
  }

  function getStayInfo(conv: ConversationDetail) {
    const b = conv.bookings
    if (!b) return null
    const checkIn = new Date(b.check_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const checkOut = new Date(b.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${checkIn} – ${checkOut}`
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/4" />
          <div className="mt-8 space-y-3">
            <div className="h-12 bg-gray-100 rounded-xl w-2/3" />
            <div className="h-12 bg-gray-100 rounded-xl w-1/2 ml-auto" />
            <div className="h-12 bg-gray-100 rounded-xl w-2/3" />
          </div>
        </div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error || 'Conversation not found'}</p>
          <button
            onClick={() => router.push('/cohost/messaging/inbox')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
          >
            Back to Inbox
          </button>
        </div>
      </div>
    )
  }

  const guestName = getGuestName(conversation)
  const stayInfo = getStayInfo(conversation)

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex-shrink-0">
        <button
          onClick={() => router.push('/cohost/messaging/inbox')}
          className="flex items-center text-sm text-gray-500 hover:text-gray-900 mb-3 transition-colors"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Inbox
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{guestName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {conversation.cohost_properties && (
                <span className="text-sm text-gray-500">{conversation.cohost_properties.name}</span>
              )}
              {stayInfo && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-gray-500">{stayInfo}</span>
                </>
              )}
            </div>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded mt-0.5">
            {conversation.channel === 'gmail_relay' ? 'Airbnb / VRBO' : 'Direct'}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-8">
            No messages yet in this conversation.
          </div>
        )}

        {messages.map((msg) => {
          const isInbound = msg.direction === 'inbound'
          return (
            <div
              key={msg.id}
              className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
            >
              <div className={`max-w-[75%] ${isInbound ? '' : ''}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    isInbound
                      ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                      : 'bg-teal-600 text-white rounded-tr-sm'
                  }`}
                >
                  {msg.body}
                </div>
                <p className={`text-xs text-gray-400 mt-1 ${isInbound ? 'text-left' : 'text-right'}`}>
                  {formatTime(msg.sent_at)}
                  {!isInbound && msg.sent_by_user_id === null && (
                    <span className="ml-1 text-teal-500">· Navi</span>
                  )}
                </p>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex-shrink-0 flex items-start justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Delivery warning (message stored but Gmail send failed) */}
      {deliveryWarning && (
        <div className="mx-4 mb-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg flex-shrink-0 flex items-start justify-between">
          <span>{deliveryWarning}</span>
          <button onClick={() => setDeliveryWarning(null)} className="ml-2 text-amber-400 hover:text-amber-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* AI Draft section */}
      {(() => {
        const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
        const hasUnrepliedMessage = !!lastInbound

        if (draft) {
          return (
            <div className="mx-4 mb-3 border border-teal-200 bg-teal-50 rounded-xl p-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                  Navi Draft
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGenerateDraft}
                    disabled={generatingDraft || draftAction !== null}
                    className="text-xs text-teal-600 hover:text-teal-800 disabled:opacity-50 flex items-center gap-1"
                  >
                    {generatingDraft ? <Spinner /> : null}
                    Regenerate
                  </button>
                  <button
                    onClick={() => handleDraftAction('dismiss')}
                    disabled={draftAction !== null}
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <textarea
                value={draftEditText}
                onChange={(e) => setDraftEditText(e.target.value)}
                rows={4}
                className="w-full text-sm bg-white border border-teal-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleDraftAction('approve')}
                  disabled={draftAction !== null || sending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {draftAction === 'approve' ? <Spinner /> : null}
                  Send as-is
                </button>
                <button
                  onClick={() => handleDraftAction('edit')}
                  disabled={draftAction !== null || sending || draftEditText.trim() === draft.draft_body.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-teal-300 text-teal-700 text-sm font-medium rounded-lg hover:bg-teal-50 disabled:opacity-50 transition-colors"
                >
                  {draftAction === 'edit' ? <Spinner /> : null}
                  Send edited
                </button>
              </div>
            </div>
          )
        }

        if (hasUnrepliedMessage) {
          return (
            <div className="mx-4 mb-3 flex-shrink-0">
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-teal-300 text-teal-600 text-sm font-medium rounded-xl hover:bg-teal-50 disabled:opacity-50 transition-colors"
              >
                {generatingDraft ? (
                  <>
                    <Spinner />
                    Drafting reply…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Generate Navi Draft
                  </>
                )}
              </button>
            </div>
          )
        }

        return null
      })()}

      {/* Compose box */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-3">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Reply to guest…"
            rows={2}
            className="flex-1 text-sm border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={sending || !replyText.trim()}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            {sending ? <Spinner /> : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            Send
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {conversation.channel === 'gmail_relay'
            ? 'Replies will be sent via Gmail to the relay address.'
            : 'Replies will be sent via email to the guest.'}
          {' '}⌘↵ to send.
        </p>
      </div>
    </div>
  )
}
