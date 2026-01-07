// /app/cohost/messaging/messages/[id]/MessageActions.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface MessageActionsProps {
  messageId: string
  workspaceId: string
  conversationId: string
  currentStatus: string
  draftText: string
  draftRiskLevel: string | null
  draftRecommendation: string | null
  pmsType: string
}

export default function MessageActions({
  messageId,
  workspaceId,
  currentStatus,
  draftText,
  draftRiskLevel,
  draftRecommendation,
  pmsType
}: MessageActionsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [editedReply, setEditedReply] = useState(draftText)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  
  const handleGenerateDraft = async () => {
    setIsLoading('generate')
    setError(null)
    
    try {
      const response = await fetch('/api/cohost/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, workspaceId })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate draft')
      }
      
      const data = await response.json()
      setEditedReply(data.reply)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft')
    } finally {
      setIsLoading(null)
    }
  }
  
  const handleApproveAndSend = async () => {
    setIsLoading('approve-send')
    setError(null)
    setSendFailed(false)
    
    try {
      // Step 1: Approve
      const approveResponse = await fetch('/api/cohost/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, workspaceId, finalReply: editedReply })
      })
      
      if (!approveResponse.ok) {
        const data = await approveResponse.json()
        throw new Error(data.error || 'Failed to approve')
      }
      
      // Step 2: Send via PMS
      const sendResponse = await fetch('/api/cohost/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, replyText: editedReply })
      })
      
      if (!sendResponse.ok) {
        const data = await sendResponse.json()
        // Send failed, but approve succeeded - show fallback option
        setSendFailed(true)
        throw new Error(data.error || 'Failed to send via ' + pmsType)
      }
      
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve and send')
    } finally {
      setIsLoading(null)
    }
  }
  
  const handleApproveOnly = async () => {
    setIsLoading('approve')
    setError(null)
    
    try {
      const response = await fetch('/api/cohost/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, workspaceId, finalReply: editedReply })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to approve')
      }
      
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsLoading(null)
    }
  }
  
  const handleEscalate = async () => {
    setIsLoading('escalate')
    setError(null)
    
    try {
      const response = await fetch('/api/cohost/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, workspaceId })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to escalate')
      }
      
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to escalate')
    } finally {
      setIsLoading(null)
    }
  }
  
  const handleCopyAndMarkSent = async () => {
    setIsLoading('copy')
    setError(null)
    
    try {
      await navigator.clipboard.writeText(editedReply)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
      
      const response = await fetch('/api/cohost/mark-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, workspaceId })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to mark as sent')
      }
      
      setSendFailed(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy')
    } finally {
      setIsLoading(null)
    }
  }
  
  const isDisabled = isLoading !== null

  const getRiskStyle = (risk: string) => {
    const styles: Record<string, string> = {
      low: 'bg-green-100 text-green-800',
      med: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800'
    }
    return styles[risk] || styles.low
  }

  const getRiskLabel = (risk: string) => {
    if (risk === 'med') return 'Medium'
    return risk.charAt(0).toUpperCase() + risk.slice(1)
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Your Reply
        </h2>
        {draftRiskLevel && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRiskStyle(draftRiskLevel)}`}>
            {getRiskLabel(draftRiskLevel)} Risk
          </span>
        )}
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}
      
      {sendFailed && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          Auto-send failed. You can copy the message and send it manually in {pmsType}.
        </div>
      )}
      
      <textarea
        className="w-full border rounded-lg p-4 text-gray-800 min-h-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-3"
        value={editedReply}
        onChange={(e) => setEditedReply(e.target.value)}
        placeholder="Click 'Generate Draft' to create an AI-powered reply, or type your own response here..."
        disabled={currentStatus === 'sent' || currentStatus === 'escalated'}
      />
      
      {draftRecommendation && (
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-medium">AI Recommendation:</span> {draftRecommendation}
        </p>
      )}
      
      <div className="flex flex-wrap gap-3">
        {/* Generate Draft Button */}
        {currentStatus !== 'sent' && currentStatus !== 'escalated' && (
          <button
            onClick={handleGenerateDraft}
            disabled={isDisabled}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading === 'generate' ? (
              <>
                <Spinner />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <span>🤖</span>
                <span>{editedReply ? 'Regenerate Draft' : 'Generate Draft'}</span>
              </>
            )}
          </button>
        )}
        
        {/* Approve & Send Button (main action for new/drafted messages) */}
        {currentStatus !== 'sent' && currentStatus !== 'escalated' && currentStatus !== 'approved' && editedReply && (
          <button
            onClick={handleApproveAndSend}
            disabled={isDisabled || !editedReply}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading === 'approve-send' ? (
              <>
                <Spinner />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>✅</span>
                <span>Approve & Send</span>
              </>
            )}
          </button>
        )}
        
        {/* Approve Only Button (secondary option) */}
        {currentStatus !== 'sent' && currentStatus !== 'escalated' && currentStatus !== 'approved' && editedReply && (
          <button
            onClick={handleApproveOnly}
            disabled={isDisabled || !editedReply}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading === 'approve' ? (
              <>
                <Spinner />
                <span>Approving...</span>
              </>
            ) : (
              <>
                <span>📝</span>
                <span>Approve Only</span>
              </>
            )}
          </button>
        )}
        
        {/* Copy + Mark Sent Button (for approved messages or when auto-send fails) */}
        {(currentStatus === 'approved' || sendFailed) && (
          <button
            onClick={handleCopyAndMarkSent}
            disabled={isDisabled || !editedReply}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading === 'copy' ? (
              <>
                <Spinner />
                <span>Copying...</span>
              </>
            ) : copied ? (
              <>
                <span>✅</span>
                <span>Copied! Paste in {pmsType}</span>
              </>
            ) : (
              <>
                <span>📋</span>
                <span>Copy + Mark Sent</span>
              </>
            )}
          </button>
        )}
        
        {/* Escalate Button */}
        {currentStatus !== 'sent' && currentStatus !== 'escalated' && (
          <button
            onClick={handleEscalate}
            disabled={isDisabled}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading === 'escalate' ? (
              <>
                <Spinner />
                <span>Escalating...</span>
              </>
            ) : (
              <>
                <span>🚨</span>
                <span>Escalate</span>
              </>
            )}
          </button>
        )}
      </div>
      
      {currentStatus === 'sent' && (
        <p className="mt-4 text-green-600 font-medium">
          ✅ This message has been marked as sent.
        </p>
      )}
      {currentStatus === 'escalated' && (
        <p className="mt-4 text-red-600 font-medium">
          🚨 This message has been escalated to an admin.
        </p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
        fill="none"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}