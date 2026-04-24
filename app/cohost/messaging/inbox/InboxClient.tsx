// /app/cohost/messaging/inbox/InboxClient.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationSummary {
  id: string
  channel: 'gmail_relay' | 'direct_email'
  last_message_at: string | null
  unread_count: number
  bookings: {
    id: string
    guest_name: string | null
    enriched_guest_name: string | null
    check_in: string
    check_out: string
    source: string | null
    enriched_connection_id: string | null
  } | null
  cohost_properties: { id: string; name: string } | null
  last_message_body?: string
  last_message_direction?: 'inbound' | 'outbound'
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
  draft_body: string
  status: string
  edited_body: string | null
}

type FilterTab = 'all' | 'unread'
type MobilePanel = 'list' | 'thread'
type BookingStatus = 'current' | 'upcoming' | 'past'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function guestName(c: ConversationSummary) {
  const b = c.bookings
  if (!b) return 'Unknown Guest'
  return b.enriched_guest_name || b.guest_name || 'Unknown Guest'
}

function stayDates(c: ConversationSummary) {
  const b = c.bookings
  if (!b) return ''
  const ci = new Date(b.check_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const co = new Date(b.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${ci} – ${co}`
}

function getBookingStatus(c: ConversationSummary): BookingStatus {
  if (!c.bookings) return 'past'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const checkIn = new Date(c.bookings.check_in); checkIn.setHours(0, 0, 0, 0)
  const checkOut = new Date(c.bookings.check_out); checkOut.setHours(0, 0, 0, 0)
  if (checkIn <= today && checkOut >= today) return 'current'
  if (checkIn > today) return 'upcoming'
  return 'past'
}

function sortConversations(convos: ConversationSummary[]): ConversationSummary[] {
  const statusOrder: Record<BookingStatus, number> = { current: 0, upcoming: 1, past: 2 }
  return [...convos].sort((a, b) => {
    const sa = getBookingStatus(a)
    const sb = getBookingStatus(b)
    // 1. Group order: current → upcoming → past
    if (statusOrder[sa] !== statusOrder[sb]) return statusOrder[sa] - statusOrder[sb]
    // 2. Unread bubbles to top within group
    const ua = a.unread_count > 0 ? 1 : 0
    const ub = b.unread_count > 0 ? 1 : 0
    if (ua !== ub) return ub - ua
    // 3. Date sort within group
    if (!a.bookings || !b.bookings) return 0
    if (sa === 'current') {
      // Check-out soonest first (most urgent)
      return new Date(a.bookings.check_out).getTime() - new Date(b.bookings.check_out).getTime()
    }
    if (sa === 'upcoming') {
      // Arriving soonest first
      return new Date(a.bookings.check_in).getTime() - new Date(b.bookings.check_in).getTime()
    }
    // past: most recent check-in first
    return new Date(b.bookings.check_in).getTime() - new Date(a.bookings.check_in).getTime()
  })
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  const hrs = Math.floor(ms / 3600000)
  const days = Math.floor(ms / 86400000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m`
  if (hrs < 24) return `${hrs}h`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function msgTime(dateStr: string): string {
  const date = new Date(dateStr)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg
      className={`animate-spin h-${size} w-${size} flex-shrink-0`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InboxClient() {
  const { workspaceId } = useAuth()
  const supabase = createClient()

  // Sidebar
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [connectionMap, setConnectionMap] = useState<Map<string, { name: string; color: string | null }>>(new Map())
  const [loadingList, setLoadingList] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importIsGood, setImportIsGood] = useState(false)

  // Thread
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState<AiDraft | null>(null)
  const [draftText, setDraftText] = useState('')
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [draftAction, setDraftAction] = useState<string | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [deliveryWarning, setDeliveryWarning] = useState<string | null>(null)

  // Mobile: 'list' shows sidebar, 'thread' shows message panel
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list')

  const bottomRef = useRef<HTMLDivElement>(null)
  const selectedConvo = conversations.find(c => c.id === selectedId) ?? null

  // ── Load conversation list ─────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!workspaceId) return
    setLoadingList(true)

    let q = supabase
      .from('cohost_conversations')
      .select(`
        id, channel, last_message_at, unread_count,
        bookings(id, guest_name, enriched_guest_name, check_in, check_out, source, enriched_connection_id),
        cohost_properties(id, name)
      `)
      .eq('workspace_id', workspaceId)
      .limit(100)

    if (filter === 'unread') q = q.gt('unread_count', 0)

    const { data } = await q
    const convos = (data || []) as unknown as ConversationSummary[]

    // Batch-fetch the last message for each conversation
    if (convos.length > 0) {
      const { data: msgs } = await supabase
        .from('cohost_messages')
        .select('conversation_id, body, direction, sent_at')
        .in('conversation_id', convos.map(c => c.id))
        .order('sent_at', { ascending: false })

      const lastMap: Record<string, { body: string; direction: 'inbound' | 'outbound' }> = {}
      for (const m of msgs || []) {
        if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = { body: m.body, direction: m.direction }
      }
      for (const c of convos) {
        const l = lastMap[c.id]
        if (l) { c.last_message_body = l.body; c.last_message_direction = l.direction }
      }
    }

    setConversations(convos)
    setLoadingList(false)
  }, [workspaceId, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadConversations() }, [loadConversations])

  // Fetch connections once (for label + color on each conversation row)
  useEffect(() => {
    async function fetchConnections() {
      const { data } = await supabase.from('connections').select('id, name, color')
      if (data) {
        const map = new Map<string, { name: string; color: string | null }>()
        data.forEach(c => { if (c.id) map.set(c.id, { name: c.name || '', color: c.color || null }) })
        setConnectionMap(map)
      }
    }
    fetchConnections()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load thread ────────────────────────────────────────────────────────────

  async function loadThread(convId: string, currentUnread: number) {
    setLoadingThread(true)
    setMessages([])
    setDraft(null)
    setDraftText('')
    setReplyText('')
    setThreadError(null)
    setDeliveryWarning(null)

    const { data: msgs, error: msgsErr } = await supabase
      .from('cohost_messages')
      .select('id, conversation_id, direction, body, sent_at, sent_by_user_id, is_read')
      .eq('conversation_id', convId)
      .order('sent_at', { ascending: true })

    if (msgsErr) setThreadError('Failed to load messages')
    else setMessages((msgs || []) as Message[])

    const { data: pendingDraft } = await supabase
      .from('cohost_ai_drafts')
      .select('id, draft_body, status, edited_body')
      .eq('conversation_id', convId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pendingDraft) {
      setDraft(pendingDraft as AiDraft)
      setDraftText(pendingDraft.draft_body)
    }

    // Mark as read
    if (currentUnread > 0) {
      await supabase.from('cohost_conversations').update({ unread_count: 0 }).eq('id', convId)
      await supabase.from('cohost_messages').update({ is_read: true }).eq('conversation_id', convId).eq('is_read', false)
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c))
    }

    setLoadingThread(false)
  }

  // Scroll to bottom when messages load
  useEffect(() => {
    if (!loadingThread) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingThread])

  // ── Select conversation ────────────────────────────────────────────────────

  function selectConversation(convo: ConversationSummary) {
    setSelectedId(convo.id)
    setMobilePanel('thread')
    loadThread(convo.id, convo.unread_count)
  }

  // ── Gmail sync ─────────────────────────────────────────────────────────────

  async function syncGmail() {
    setImporting(true)
    setImportMsg(null)
    try {
      const res = await fetch('/api/cohost/messaging/backfill', { method: 'POST' })
      const data = await res.json()
      setImportMsg(data.message)
      setImportIsGood(data.total_imported > 0 || data.conversations_created > 0)
      await loadConversations()
    } catch {
      setImportMsg('Sync failed — please try again')
      setImportIsGood(false)
    } finally {
      setImporting(false)
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  async function handleSend(bodyOverride?: string) {
    const text = (bodyOverride ?? replyText).trim()
    if (!text || !selectedId) return

    setSending(true)
    setThreadError(null)
    setDeliveryWarning(null)

    const res = await fetch('/api/cohost/messaging/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: selectedId,
        body: text,
        draft_id: draft?.id ?? null,
        edited: draft ? text !== draft.draft_body : false,
      }),
    })

    const data = await res.json()
    setSending(false)

    if (!res.ok) { setThreadError(data.error || 'Failed to send'); return }

    setMessages(prev => [...prev, data.message as Message])
    setReplyText('')
    setDraft(null)

    // Optimistically update sidebar preview
    setConversations(prev => prev.map(c =>
      c.id === selectedId
        ? { ...c, last_message_body: text, last_message_direction: 'outbound', last_message_at: new Date().toISOString() }
        : c
    ))

    if (!data.delivered && data.delivery_error) {
      setDeliveryWarning(`Saved but not delivered: ${data.delivery_error}`)
    }
  }

  // ── Draft actions ──────────────────────────────────────────────────────────

  async function handleDraftAction(action: 'approve' | 'edit' | 'dismiss') {
    if (!draft) return
    setDraftAction(action)
    if (action === 'approve') await handleSend(draft.draft_body)
    else if (action === 'edit') await handleSend(draftText)
    else {
      await supabase.from('cohost_ai_drafts').update({ status: 'dismissed' }).eq('id', draft.id)
      setDraft(null)
    }
    setDraftAction(null)
  }

  async function generateDraft() {
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    if (!lastInbound || !selectedId) return
    setGeneratingDraft(true)
    setThreadError(null)
    const res = await fetch('/api/cohost/messaging/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selectedId, message_id: lastInbound.id }),
    })
    const data = await res.json()
    setGeneratingDraft(false)
    if (!res.ok) { setThreadError(data.error || 'Failed to generate draft'); return }
    setDraft({ id: data.draft.id, draft_body: data.draft.draft_body, status: 'pending', edited_body: null })
    setDraftText(data.draft.draft_body)
  }

  // ─────────────────────────────────────────────────────────────────────────
  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0)

  return (
    <div className="flex bg-white overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside className={`
        flex flex-col w-full sm:w-72 md:w-80 flex-shrink-0
        border-r border-gray-200 bg-white
        ${mobilePanel === 'thread' ? 'hidden sm:flex' : 'flex'}
      `}>

        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Inbox</h1>
              {totalUnread > 0 && (
                <p className="text-xs text-teal-600 font-medium mt-0.5">{totalUnread} unread</p>
              )}
            </div>
            <button
              onClick={syncGmail}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white
                         bg-teal-600 rounded-lg hover:bg-teal-700
                         disabled:opacity-50 transition-colors shadow-sm"
            >
              {importing
                ? <Spinner size={3} />
                : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )
              }
              {importing ? 'Syncing…' : 'Sync Gmail'}
            </button>
          </div>

          {/* Sync result */}
          {importMsg && (
            <p className={`text-xs mb-2.5 leading-relaxed ${importIsGood ? 'text-teal-700' : 'text-gray-400'}`}>
              {importMsg}
            </p>
          )}

          {/* Filter tabs */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['all', 'unread'] as FilterTab[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === f
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f === 'all' ? 'All' : (
                  <span className="flex items-center justify-center gap-1.5">
                    Unread
                    {totalUnread > 0 && (
                      <span className="bg-teal-600 text-white text-[10px] font-bold px-1.5 py-px rounded-full leading-none">
                        {totalUnread}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 space-y-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-start gap-3 px-1 py-3 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-gray-200 mt-2 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-200 rounded w-2/3" />
                    <div className="h-2.5 bg-gray-100 rounded w-4/5" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 10h.01M12 10h.01M16 10h.01M21 16a2 2 0 01-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">
                {filter === 'unread' ? 'All caught up' : 'No conversations yet'}
              </p>
              <p className="text-xs text-gray-400">
                {filter === 'unread'
                  ? 'No unread messages right now.'
                  : 'Use Sync Gmail above to import guest conversations.'}
              </p>
            </div>
          ) : (() => {
            const sorted = sortConversations(conversations)
            const allGroups: { label: string; status: BookingStatus; items: ConversationSummary[] }[] = [
              { label: 'Staying Now', status: 'current' as BookingStatus, items: sorted.filter(c => getBookingStatus(c) === 'current') },
              { label: 'Upcoming',    status: 'upcoming' as BookingStatus, items: sorted.filter(c => getBookingStatus(c) === 'upcoming') },
              { label: 'Past',        status: 'past' as BookingStatus,     items: sorted.filter(c => getBookingStatus(c) === 'past') },
            ]
            const groups = allGroups.filter(g => g.items.length > 0)

            return groups.map(group => (
              <div key={group.status}>
                {/* Section header */}
                <div className={`flex items-center gap-2 px-4 py-1.5 sticky top-0 z-10 border-b border-gray-100 ${
                  group.status === 'current' ? 'bg-amber-50' : 'bg-gray-50'
                }`}>
                  {group.status === 'current' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5F] flex-shrink-0" />
                  )}
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                    group.status === 'current' ? 'text-[#FF5A5F]' : 'text-gray-400'
                  }`}>
                    {group.label}
                  </span>
                  <span className={`text-[10px] ${
                    group.status === 'current' ? 'text-[#FF5A5F]/60' : 'text-gray-300'
                  }`}>
                    {group.items.length}
                  </span>
                </div>

                {group.items.map(convo => {
                  const isSelected = convo.id === selectedId
                  const isUnread = convo.unread_count > 0
                  const isCurrent = group.status === 'current'
                  const name = guestName(convo)

                  return (
                    <button
                      key={convo.id}
                      onClick={() => selectConversation(convo)}
                      className={`w-full text-left px-4 py-3.5 border-b border-gray-100 transition-colors relative ${
                        isSelected
                          ? 'bg-teal-50'
                          : isCurrent
                            ? 'bg-amber-50/60 hover:bg-amber-100/60'
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Left indicator bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-500 rounded-r" />
                      )}
                      {!isSelected && isCurrent && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#FF5A5F]/40 rounded-r" />
                      )}

                      <div className="flex items-start gap-2.5">
                        {/* Unread dot */}
                        <div className="mt-[7px] flex-shrink-0 w-2 h-2">
                          {isUnread && <div className="w-2 h-2 rounded-full bg-teal-500" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className={`text-sm truncate leading-snug ${
                              isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                            }`}>
                              {name}
                            </span>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-1">
                              <span className="text-[11px] text-gray-400 whitespace-nowrap leading-none">
                                {relativeTime(convo.last_message_at)}
                              </span>
                              {isUnread && (
                                <span className="bg-teal-600 text-white text-[10px] font-bold px-1.5 py-px rounded-full leading-none">
                                  {convo.unread_count}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            {/* Connection label with color dot */}
                            {(() => {
                              const connId = convo.bookings?.enriched_connection_id
                              const conn = connId ? connectionMap.get(connId) : null
                              if (!conn) return null
                              const color = conn.color || '#9CA3AF'
                              return (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                  <span className="text-[10px] font-semibold flex-shrink-0 leading-none truncate max-w-[5rem]" style={{ color }}>
                                    {conn.name}
                                  </span>
                                  <span className="text-gray-200 text-[10px] flex-shrink-0 leading-none">·</span>
                                </>
                              )
                            })()}
                            {convo.cohost_properties && (
                              <p className="text-[11px] text-gray-400 truncate leading-none">
                                {convo.cohost_properties.name}
                              </p>
                            )}
                            {convo.bookings && (
                              <p className="text-[11px] text-gray-300 flex-shrink-0 leading-none">
                                · {stayDates(convo)}
                              </p>
                            )}
                          </div>

                          <p className={`text-xs mt-1 truncate leading-snug ${
                            isUnread ? 'text-gray-700' : 'text-gray-400'
                          }`}>
                            {convo.last_message_body ? (
                              <>
                                {convo.last_message_direction === 'outbound' && (
                                  <span className="text-gray-400 mr-0.5">You: </span>
                                )}
                                {convo.last_message_body}
                              </>
                            ) : (
                              <span className="italic text-gray-300">No messages yet</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          })()}
        </div>
      </aside>

      {/* ══════════════════ THREAD PANEL ══════════════════ */}
      <section className={`
        flex-1 flex flex-col min-w-0 bg-gray-50
        ${mobilePanel === 'list' ? 'hidden sm:flex' : 'flex'}
      `}>

        {/* ── No conversation selected ── */}
        {!selectedConvo ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-gray-50">
            <div className="w-16 h-16 bg-white border border-gray-200 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M21 16a2 2 0 01-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-500">Select a conversation</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Choose a guest from the sidebar to view their messages
            </p>
          </div>
        ) : (
          <>
            {/* ── Thread header ── */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
              <div className="flex items-start gap-2">
                {/* Back (mobile) */}
                <button
                  onClick={() => setMobilePanel('list')}
                  className="sm:hidden flex-shrink-0 -ml-1 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors mt-0.5"
                  aria-label="Back to inbox"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-gray-900 truncate leading-snug">
                      {guestName(selectedConvo)}
                    </h2>
                    <span className="flex-shrink-0 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {selectedConvo.channel === 'gmail_relay' ? 'Airbnb / VRBO' : 'Direct'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {selectedConvo.cohost_properties && (
                      <span className="text-xs text-gray-500">{selectedConvo.cohost_properties.name}</span>
                    )}
                    {stayDates(selectedConvo) && (
                      <>
                        <span className="text-gray-300 text-xs">·</span>
                        <span className="text-xs text-gray-500">{stayDates(selectedConvo)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
              {loadingThread ? (
                <div className="flex items-center justify-center py-16">
                  <Spinner size={5} />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-gray-400">No messages yet.</p>
                  <p className="text-xs text-gray-300 mt-1">
                    Guest messages will appear here when they arrive.
                  </p>
                </div>
              ) : (
                messages.map(msg => {
                  const inbound = msg.direction === 'inbound'
                  return (
                    <div key={msg.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-[80%] sm:max-w-[68%]">
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                          inbound
                            ? 'bg-white text-gray-900 rounded-tl-none border border-gray-100'
                            : 'bg-teal-600 text-white rounded-tr-none'
                        }`}>
                          {msg.body}
                        </div>
                        <p className={`text-[11px] text-gray-400 mt-1 ${inbound ? 'pl-1' : 'pr-1 text-right'}`}>
                          {msgTime(msg.sent_at)}
                          {!inbound && msg.sent_by_user_id === null && (
                            <span className="ml-1 text-teal-500">· Navi</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* ── Error / warning banners ── */}
            {threadError && (
              <div className="mx-4 mb-2 flex-shrink-0 px-3 py-2 bg-red-50 border border-red-200 rounded-lg
                              flex items-center justify-between">
                <span className="text-xs text-red-700">{threadError}</span>
                <button onClick={() => setThreadError(null)}
                  className="ml-2 flex-shrink-0 text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
            )}
            {deliveryWarning && (
              <div className="mx-4 mb-2 flex-shrink-0 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg
                              flex items-center justify-between">
                <span className="text-xs text-amber-800">{deliveryWarning}</span>
                <button onClick={() => setDeliveryWarning(null)}
                  className="ml-2 flex-shrink-0 text-amber-400 hover:text-amber-600 text-xs">✕</button>
              </div>
            )}

            {/* ── AI draft / generate button ── */}
            {(() => {
              const hasInbound = messages.some(m => m.direction === 'inbound')

              if (draft) return (
                <div className="mx-4 mb-3 flex-shrink-0 bg-white border border-teal-200 rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">
                      Navi Draft
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={generateDraft}
                        disabled={generatingDraft || !!draftAction}
                        className="text-xs text-teal-600 hover:text-teal-800 disabled:opacity-50 flex items-center gap-1"
                      >
                        {generatingDraft && <Spinner size={3} />}
                        Regenerate
                      </button>
                      <button
                        onClick={() => handleDraftAction('dismiss')}
                        disabled={!!draftAction}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={draftText}
                    onChange={e => setDraftText(e.target.value)}
                    rows={3}
                    className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2
                               text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400
                               focus:border-transparent resize-none"
                  />
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => handleDraftAction('approve')}
                      disabled={!!draftAction || sending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white
                                 text-xs font-medium rounded-lg hover:bg-teal-700
                                 disabled:opacity-50 transition-colors"
                    >
                      {draftAction === 'approve' && <Spinner size={3} />}
                      Send as-is
                    </button>
                    <button
                      onClick={() => handleDraftAction('edit')}
                      disabled={!!draftAction || sending || draftText.trim() === draft.draft_body.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-teal-300
                                 text-teal-700 text-xs font-medium rounded-lg hover:bg-teal-50
                                 disabled:opacity-50 transition-colors"
                    >
                      {draftAction === 'edit' && <Spinner size={3} />}
                      Send edited
                    </button>
                  </div>
                </div>
              )

              if (hasInbound && !loadingThread) return (
                <div className="mx-4 mb-3 flex-shrink-0">
                  <button
                    onClick={generateDraft}
                    disabled={generatingDraft}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed
                               border-teal-300 text-teal-600 text-xs font-medium rounded-xl
                               hover:bg-teal-50 disabled:opacity-50 transition-colors bg-white"
                  >
                    {generatingDraft ? (
                      <><Spinner size={3} /> Drafting reply…</>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        Generate Navi Draft
                      </>
                    )}
                  </button>
                </div>
              )

              return null
            })()}

            {/* ── Compose ── */}
            <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend() }
                  }}
                  placeholder="Reply to guest…"
                  rows={2}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5
                             text-gray-900 placeholder-gray-400 focus:outline-none
                             focus:ring-2 focus:ring-teal-400 focus:border-transparent
                             resize-none transition-shadow"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={sending || !replyText.trim()}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 bg-teal-600
                             text-white text-sm font-medium rounded-xl hover:bg-teal-700
                             disabled:opacity-40 transition-colors"
                >
                  {sending
                    ? <Spinner size={4} />
                    : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )
                  }
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                {selectedConvo.channel === 'gmail_relay'
                  ? 'Sent via Gmail to the Airbnb/VRBO relay address.'
                  : 'Sent via email to the guest.'}
                {' '}⌘↵ to send.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
