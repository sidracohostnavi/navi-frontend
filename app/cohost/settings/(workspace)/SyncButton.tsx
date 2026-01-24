// /app/cohost/settings/SyncButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SyncButtonProps {
  workspaceId: string
}

export default function SyncButton({ workspaceId }: SyncButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null)

  const handleSync = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/cohost/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      })

      const data = await response.json()

      if (response.ok) {
        setResult({ 
          success: true, 
          message: `Synced! ${data.newMessages || 0} new messages found.` 
        })
        router.refresh()
      } else {
        setResult({ 
          success: false, 
          message: data.error || 'Sync failed' 
        })
      }
    } catch (err) {
      setResult({ 
        success: false, 
        message: 'Failed to connect' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className={`text-xs ${result.success ? 'text-green-700' : 'text-red-700'}`}>
          {result.message}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={isLoading}
        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  )
}