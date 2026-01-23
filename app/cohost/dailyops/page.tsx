// app/daily-ops/page.tsx
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { SummaryBar } from './components/SummaryBar'
import { TaskSection } from './components/TaskSection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DailyOpsPage() {
  const supabase = await createClient()

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'open') // use 'pending' here instead if your status uses that word
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true })

  // helpful in dev; you can delete later if you want
  console.log('Tasks fetched:', tasks)
  console.log('Error:', error)

  if (error) {
    console.error('Error fetching tasks:', error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium">Failed to load tasks</p>
          <p className="text-gray-500 text-sm mt-2">{error.message}</p>
        </div>
      </div>
    )
  }

  const allTasks = tasks ?? []
  const urgentTasks = allTasks.filter(t => t.priority === 'high')
  const normalTasks = allTasks.filter(t => t.priority !== 'high')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10">
              <Image
                src="/navi-mascot.png"
                alt="Navi Co-Host mascot"
                fill
                sizes="40px"
                className="rounded-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Ops</h1>
              <p className="text-gray-600 text-sm">Your Navi Co-Host summary</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <SummaryBar tasks={allTasks} />

        <TaskSection
          title="⚠️ Urgent Tasks"
          tasks={urgentTasks}
          emptyMessage="No urgent tasks — you're all set! ✨"
        />

        <TaskSection
          title="📋 Normal Tasks"
          tasks={normalTasks}
          emptyMessage="All caught up! No normal tasks pending."
        />
      </div>
    </div>
  )
}
