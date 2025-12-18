// app/daily-ops/components/SummaryBar.tsx

// Local Task type – keep in sync with your Supabase tasks table
type Task = {
  id: string
  task: string
  due_date: string | null
  priority: string
  status: string
  platform: string | null
}

interface SummaryBarProps {
  tasks: Task[]
}

export function SummaryBar({ tasks }: SummaryBarProps) {
  const now = new Date()

  // Only count open tasks in the stats
  const openTasks = tasks.filter((t) => t.status === 'open')

  const urgentCount = openTasks.filter(
    (t) => t.priority === 'high'
  ).length

  const normalCount = openTasks.filter(
    (t) => t.priority !== 'high'
  ).length

  const overdueCount = openTasks.filter((t) => {
    if (!t.due_date) return false
    const due = new Date(t.due_date)
    return due < now
  }).length

  const stats = [
    {
      label: 'Urgent Tasks',
      count: urgentCount,
      color: 'bg-red-50 border-red-200 text-red-700',
      icon: '⚠️',
    },
    {
      label: 'Normal Tasks',
      count: normalCount,
      color: 'bg-gray-50 border-gray-200 text-gray-700',
      icon: '📋',
    },
    {
      label: 'Overdue Tasks',
      count: overdueCount,
      color: 'bg-orange-50 border-orange-200 text-orange-700',
      icon: '⏰',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`${stat.color} border rounded-xl p-6 transition-all hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-75">
                {stat.label}
              </p>
              <p className="text-3xl font-bold mt-2">
                {stat.count}
              </p>
            </div>
            <div className="text-4xl opacity-20">{stat.icon}</div>
          </div>
        </div>
      ))}
    </div>
  )
}