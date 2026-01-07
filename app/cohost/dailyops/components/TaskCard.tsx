'use client'

import { useState, useTransition } from 'react'
import { markTaskDone, dismissTask } from '../actions'

interface TaskCardProps {
  task: {
    id: string
    task: string
    due_date: string | null
    priority: string
    status: string
    platform?: string | null
  }
}

const platformLinks: Record<string, string> = {
  airbnb: 'https://www.airbnb.com/hosting/inbox',
  vrbo: 'https://www.vrbo.com/hc/dashboard',
  'booking.com': 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/inbox.html',
  lodgify: 'https://app.lodgify.com/inbox',
  direct: '#'
}

export function TaskCard({ task }: TaskCardProps) {
  const [isHidden, setIsHidden] = useState(false)
  const [isPending, startTransition] = useTransition()

  const platform = task.platform?.toLowerCase() || 'airbnb'

  const handleDone = () => {
    setIsHidden(true)
    startTransition(async () => {
      try {
        await markTaskDone(task.id)
      } catch (error) {
        setIsHidden(false)
        alert('Failed to mark task as done')
      }
    })
  }

  const handleDismiss = () => {
    setIsHidden(true)
    startTransition(async () => {
      try {
        await dismissTask(task.id)
      } catch (error) {
        setIsHidden(false)
        alert('Failed to dismiss task')
      }
    })
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No due date'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isHidden) {
    return null
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-gray-900 font-medium mb-2">{task.task}</p>
          
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500">
              {formatDate(task.due_date)}
            </span>
            
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${task.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
              {task.priority === 'high' ? 'Urgent' : 'Normal'}
            </span>

            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 capitalize">
              {platform}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
  onClick={handleDone}
  disabled={isPending}
  className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
  style={{
    backgroundColor: '#FF676A',
  }}
  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E85A5D')}
  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FF676A')}
>
  Done
</button>

          <button onClick={handleDismiss} disabled={isPending} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            Dismiss
          </button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <a href={platformLinks[platform] || platformLinks.direct} target="_blank" rel="noopener noreferrer" className="text-sm text-red-600 hover:text-red-700 font-medium">
          Open {platform.charAt(0).toUpperCase() + platform.slice(1)}
        </a>
      </div>
    </div>
  )
}