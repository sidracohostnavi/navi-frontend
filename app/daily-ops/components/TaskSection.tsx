import { TaskCard } from './TaskCard'

interface Task {
  id: string
  task: string
  due_date: string | null
  priority: string
  status: string
  platform?: string | null
  message_id?: string | null
  host_id?: string | null
  created_at?: string
}

interface TaskSectionProps {
  title: string
  tasks: Task[]
  emptyMessage: string
}

export function TaskSection({ title, tasks, emptyMessage }: TaskSectionProps) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        {title}
        <span className="text-sm font-normal text-gray-500">
          ({tasks.length})
        </span>
      </h2>

      {tasks.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}