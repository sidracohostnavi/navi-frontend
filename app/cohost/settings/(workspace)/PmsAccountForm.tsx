// /app/cohost/settings/PmsAccountForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface PmsAccountFormProps {
  workspaceId: string
  pmsType: 'lodgify' | 'guesty' | 'hostaway'
  hasExistingKey: boolean
  keyLabel: string
  keyHint: string
}

export default function PmsAccountForm({ 
  workspaceId, 
  pmsType, 
  hasExistingKey,
  keyLabel,
  keyHint
}: PmsAccountFormProps) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)
    
    try {
      const response = await fetch('/api/cohost/settings/pms-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          pmsType,
          apiKey
        })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save')
      }
      
      setSuccess(true)
      setApiKey('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          {keyLabel} saved successfully!
        </div>
      )}
      
      <div className="flex gap-3">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasExistingKey ? '••••••••••••••••' : `Enter your ${keyLabel}`}
          className="flex-1 border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={isLoading || !apiKey}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isLoading ? 'Saving...' : hasExistingKey ? 'Update' : 'Save'}
        </button>
      </div>
      
      <p className="mt-2 text-xs text-gray-500">
        {keyHint}
      </p>
    </form>
  )
}