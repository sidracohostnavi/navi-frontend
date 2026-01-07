// /app/cohost/messaging/inbox/InboxFilters.tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function InboxFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const currentStatus = searchParams.get('status') || ''
  const currentPms = searchParams.get('pms') || ''
  const currentRisk = searchParams.get('risk') || ''
  
  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/cohost/messaging/inbox?${params.toString()}`)
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            className="border rounded px-3 py-2 text-sm"
            value={currentStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="drafted">Drafted</option>
            <option value="approved">Approved</option>
            <option value="sent">Sent</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Platform
          </label>
          <select
            className="border rounded px-3 py-2 text-sm"
            value={currentPms}
            onChange={(e) => updateFilter('pms', e.target.value)}
          >
            <option value="">All</option>
            <option value="lodgify">Lodgify</option>
            <option value="guesty">Guesty</option>
            <option value="hostaway">Hostaway</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Risk Level
          </label>
          <select
            className="border rounded px-3 py-2 text-sm"
            value={currentRisk}
            onChange={(e) => updateFilter('risk', e.target.value)}
          >
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
    </div>
  )
}