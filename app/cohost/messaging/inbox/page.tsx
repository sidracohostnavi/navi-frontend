// /app/cohost/messaging/inbox/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/auth'

interface Message {
  id: string
  body: string
  status: 'new' | 'drafted' | 'approved' | 'sent' | 'escalated'
  category: string | null
  risk_score: number | null
  received_at: string
  direction: 'inbound' | 'outbound'
  conversation_id: string
  cohost_conversations: {
    id: string
    guest_name: string | null
    pms_type: string
    cohost_properties: {
      name: string
    } | null
  } | null
}

export default function InboxPage() {
  const { workspaceId } = useAuth()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'new' | 'drafted' | 'escalated'>('all')
  
  const supabase = createBrowserClient()

  useEffect(() => {
    if (workspaceId) {
      loadMessages()
    }
  }, [workspaceId, filter])

  async function loadMessages() {
    setLoading(true)
    
    let query = supabase
      .from('cohost_messages')
      .select(`
        id,
        body,
        status,
        category,
        risk_score,
        received_at,
        direction,
        conversation_id,
        cohost_conversations (
          id,
          guest_name,
          pms_type,
          cohost_properties (
            name
          )
        )
      `)
      .eq('workspace_id', workspaceId)
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false })
      .limit(50)
    
    if (filter !== 'all') {
      query = query.eq('status', filter)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Failed to load messages:', error)
    } else {
      // Transform the data to match our interface
      const transformed = (data || []).map((msg: any) => ({
        ...msg,
        cohost_conversations: msg.cohost_conversations || null,
      })) as Message[]
      setMessages(transformed)
    }
    
    setLoading(false)
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      drafted: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-purple-100 text-purple-800',
      sent: 'bg-green-100 text-green-800',
      escalated: 'bg-red-100 text-red-800',
    }
    return styles[status] || 'bg-gray-100 text-gray-800'
  }

  function getRiskBadge(score: number | null) {
    if (score === null) return null
    if (score <= 33) return <span className="text-xs text-green-600">Low Risk</span>
    if (score <= 66) return <span className="text-xs text-yellow-600">Med Risk</span>
    return <span className="text-xs text-red-600">High Risk</span>
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  function getPmsIcon(pmsType: string) {
    const colors: Record<string, string> = {
      hostaway: 'bg-purple-500',
      guesty: 'bg-blue-500',
      hospitable: 'bg-green-500',
    }
    return (
      <span className={`inline-block w-2 h-2 rounded-full ${colors[pmsType] || 'bg-gray-500'}`} 
            title={pmsType} />
    )
  }

  const newCount = messages.filter(m => m.status === 'new').length
  const escalatedCount = messages.filter(m => m.status === 'escalated').length

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <p className="text-gray-600">Manage your guest messages</p>
        </div>
        
        <button
          onClick={loadMessages}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>
      
      {/* Filter tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['all', 'new', 'drafted', 'escalated'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === f
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'new' && newCount > 0 && (
              <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                {newCount}
              </span>
            )}
            {f === 'escalated' && escalatedCount > 0 && (
              <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
                {escalatedCount}
              </span>
            )}
          </button>
        ))}
      </div>
      
      {/* Messages list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No messages</h3>
          <p className="text-gray-500">
            {filter === 'all' 
              ? "You're all caught up! New guest messages will appear here."
              : `No ${filter} messages.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => {
            const conversation = message.cohost_conversations
            const property = conversation?.cohost_properties
            
            return (
              <div
                key={message.id}
                onClick={() => router.push(`/cohost/messaging/messages/${message.id}`)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      {conversation && getPmsIcon(conversation.pms_type)}
                      <span className="font-medium text-gray-900">
                        {conversation?.guest_name || 'Unknown Guest'}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(message.status)}`}>
                        {message.status}
                      </span>
                      {getRiskBadge(message.risk_score)}
                      {message.category && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {message.category.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    
                    {property && (
                      <p className="text-sm text-gray-500 mb-1">{property.name}</p>
                    )}
                    
                    <p className="text-gray-700 truncate">
                      {message.body}
                    </p>
                  </div>
                  
                  <div className="ml-4 text-right">
                    <span className="text-sm text-gray-500">
                      {formatTime(message.received_at)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}