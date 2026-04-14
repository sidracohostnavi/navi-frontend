'use client';

import { useState, useEffect, useCallback } from 'react';
import CreateTaskModal from './CreateTaskModal';
import CompleteTaskModal from './CompleteTaskModal';

interface Task {
  id: string;
  title: string;
  description: string | null;
  property_id: string | null;
  property_name: string | null;
  assigned_user_id: string | null;
  assigned_user_email: string | null;
  created_by: string;
  created_by_email: string | null;
  task_type: 'one_off' | 'recurring';
  recurrence_days: number | null;
  due_at: string | null;
  next_due_at: string | null;
  last_completed_at: string | null;
  effective_due_at: string | null;
  status: 'active' | 'paused' | 'cancelled';
  is_active: boolean;
  is_overdue: boolean;
  created_at: string;
  latest_completion: {
    id: string;
    completed_at: string;
    hours_worked: number | null;
    completion_note: string | null;
    calculated_amount_owed: number | null;
    host_payment_confirmed_at: string | null;
    completed_by_user_id: string;
    completed_by_email: string | null;
  } | null;
}

type TabHost = 'active' | 'overdue' | 'pending_payment' | 'completed';
type TabCleaner = 'my_tasks' | 'completed';

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  role,
  currentUserId,
  onMarkDone,
  onMarkPaid,
  onCancel,
}: {
  task: Task;
  role: string;
  currentUserId: string;
  onMarkDone: (task: Task) => void;
  onMarkPaid: (task: Task) => void;
  onCancel: (task: Task) => void;
}) {
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const isHost = ['owner', 'admin', 'manager'].includes(role);
  const canManage = ['owner', 'admin'].includes(role);
  const canComplete = role === 'cleaner'
    ? task.assigned_user_id === currentUserId
    : isHost;

  const days = daysUntil(task.effective_due_at);

  const dueBadge = () => {
    if (!task.effective_due_at) return null;
    if (task.is_overdue) {
      const absDays = Math.abs(days ?? 0);
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
          {absDays === 0 ? 'Due today' : `${absDays}d overdue`}
        </span>
      );
    }
    if (days !== null && days <= 3) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
          Due {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`}
        </span>
      );
    }
    if (days !== null) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
          Due {formatDate(task.effective_due_at)}
        </span>
      );
    }
    return null;
  };

  const handleCancelConfirmed = async () => {
    setCancelling(true);
    await onCancel(task);
    setCancelling(false);
    setCancelConfirm(false);
  };

  const handleMarkPaid = async () => {
    if (!task.latest_completion) return;
    setPayingId(task.latest_completion.id);
    await onMarkPaid(task);
    setPayingId(null);
  };

  const pendingPayment = task.latest_completion &&
    task.latest_completion.calculated_amount_owed &&
    !task.latest_completion.host_payment_confirmed_at;

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow ${task.is_overdue ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        {/* Left: Task info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {task.task_type === 'recurring' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                Recurring · {task.recurrence_days}d
              </span>
            )}
            {dueBadge()}
          </div>

          <h3 className="font-semibold text-gray-900 text-sm leading-snug truncate">{task.title}</h3>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
            {task.property_name && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                {task.property_name}
              </span>
            )}
            {task.assigned_user_email && isHost && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                {task.assigned_user_email}
              </span>
            )}
            {!task.assigned_user_email && isHost && (
              <span className="text-gray-400 italic">Unassigned</span>
            )}
          </div>

          {task.description && (
            <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{task.description}</p>
          )}

          {/* Completion info for host */}
          {task.latest_completion && isHost && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Last done: <span className="text-gray-700 font-medium">{formatDateTime(task.latest_completion.completed_at)}</span>
                {task.latest_completion.completed_by_email && ` by ${task.latest_completion.completed_by_email}`}
                {task.latest_completion.hours_worked !== null && (
                  <> · <span className="font-medium">{task.latest_completion.hours_worked}h</span></>
                )}
                {task.latest_completion.calculated_amount_owed !== null && (
                  <> · <span className={task.latest_completion.host_payment_confirmed_at ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                    ${task.latest_completion.calculated_amount_owed.toFixed(2)}
                    {task.latest_completion.host_payment_confirmed_at ? ' (paid)' : ' owed'}
                  </span></>
                )}
                {task.latest_completion.completion_note && (
                  <> · &quot;{task.latest_completion.completion_note}&quot;</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-col gap-2 items-end shrink-0">
          {/* Cleaner: Mark Done */}
          {role === 'cleaner' && canComplete && task.status === 'active' && (
            <button
              onClick={() => onMarkDone(task)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Mark Done
            </button>
          )}

          {/* Host: Mark Done (for tasks they want to complete themselves) */}
          {isHost && task.status === 'active' && !task.latest_completion && (
            <button
              onClick={() => onMarkDone(task)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Mark Done
            </button>
          )}

          {/* Host: Mark Paid */}
          {canManage && pendingPayment && (
            <button
              onClick={handleMarkPaid}
              disabled={payingId === task.latest_completion?.id}
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {payingId === task.latest_completion?.id ? 'Saving...' : 'Mark Paid'}
            </button>
          )}

          {/* Cancel (owner/admin) */}
          {canManage && task.status === 'active' && (
            <>
              {cancelConfirm ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => setCancelConfirm(false)}
                    className="px-2 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    No
                  </button>
                  <button
                    onClick={handleCancelConfirmed}
                    disabled={cancelling}
                    className="px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    {cancelling ? '...' : 'Yes'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCancelConfirm(true)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Cancel task
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Completed History Row ─────────────────────────────────────────────────────
function CompletedTaskRow({ task, role, onMarkPaid }: {
  task: Task;
  role: string;
  onMarkPaid: (task: Task) => void;
}) {
  const [paying, setPaying] = useState(false);
  const canManage = ['owner', 'admin'].includes(role);
  const c = task.latest_completion;

  const handleMarkPaid = async () => {
    setPaying(true);
    await onMarkPaid(task);
    setPaying(false);
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate">{task.title}</span>
          {task.task_type === 'recurring' && (
            <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">every {task.recurrence_days}d</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs text-gray-500">
          {task.property_name && <span>{task.property_name}</span>}
          {c && (
            <>
              <span>{formatDateTime(c.completed_at)}</span>
              {c.completed_by_email && ['owner', 'admin', 'manager'].includes(role) && (
                <span>by {c.completed_by_email}</span>
              )}
              {c.hours_worked !== null && <span>{c.hours_worked}h</span>}
              {c.calculated_amount_owed !== null && (
                <span className={c.host_payment_confirmed_at ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                  ${c.calculated_amount_owed.toFixed(2)}
                  {c.host_payment_confirmed_at ? ' — paid' : ' — unpaid'}
                </span>
              )}
              {c.completion_note && <span className="italic">&quot;{c.completion_note}&quot;</span>}
            </>
          )}
        </div>
      </div>
      {canManage && c?.calculated_amount_owed && !c.host_payment_confirmed_at && (
        <button
          onClick={handleMarkPaid}
          disabled={paying}
          className="ml-3 px-3 py-1 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shrink-0"
        >
          {paying ? '...' : 'Mark Paid'}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [role, setRole] = useState<string>('cleaner');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTabHost, setActiveTabHost] = useState<TabHost>('active');
  const [activeTabCleaner, setActiveTabCleaner] = useState<TabCleaner>('my_tasks');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);

  const isHost = ['owner', 'admin', 'manager'].includes(role);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/cohost/tasks');
      if (!res.ok) throw new Error('Failed to load tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
      setRole(data.role || 'cleaner');
      setCurrentUserId(data.currentUserId || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCancelTask = async (task: Task) => {
    await fetch(`/api/cohost/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled', is_active: false }),
    });
    await loadTasks();
  };

  const handleMarkPaid = async (task: Task) => {
    if (!task.latest_completion) return;
    await fetch(`/api/cohost/tasks/${task.id}/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completion_id: task.latest_completion.id }),
    });
    await loadTasks();
  };

  // ── Tab filtering ─────────────────────────────────────────────────────────
  const now = new Date();

  // For HOST tabs
  const activeTasks = tasks.filter(t =>
    t.status === 'active' && !t.is_overdue &&
    (!t.latest_completion || t.task_type === 'recurring')
  );
  const overdueTasks = tasks.filter(t => t.status === 'active' && t.is_overdue);
  const pendingPaymentTasks = tasks.filter(t =>
    t.latest_completion?.calculated_amount_owed &&
    !t.latest_completion.host_payment_confirmed_at
  );
  const completedTasks = tasks.filter(t => t.latest_completion !== null);

  // For CLEANER tabs
  const myActiveTasks = tasks.filter(t => t.status === 'active');
  const myCompletedTasks = tasks.filter(t => t.latest_completion?.completed_by_user_id === currentUserId);

  // ── Counts ────────────────────────────────────────────────────────────────
  const overdueCount = overdueTasks.length;
  const pendingPayCount = pendingPaymentTasks.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-sm">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={loadTasks} className="mt-2 text-sm text-red-600 underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isHost ? 'Manage and assign tasks for your properties.' : 'Your assigned tasks.'}
          </p>
        </div>
        {isHost && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
        )}
      </div>

      {/* ── HOST VIEW ── */}
      {isHost && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {([
              { key: 'active' as TabHost, label: 'Active', count: activeTasks.length, alert: false },
              { key: 'overdue' as TabHost, label: 'Overdue', count: overdueCount, alert: overdueCount > 0 },
              { key: 'pending_payment' as TabHost, label: 'Pending Payment', count: pendingPayCount, alert: pendingPayCount > 0 },
              { key: 'completed' as TabHost, label: 'Completed', count: completedTasks.length, alert: false },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTabHost(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTabHost === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] px-1 rounded-full text-xs font-bold ${
                    tab.alert ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Active */}
          {activeTabHost === 'active' && (
            <TaskList
              tasks={activeTasks}
              emptyMessage="No active tasks. Create one to get started."
              role={role}
              currentUserId={currentUserId}
              onMarkDone={(t) => setCompletingTask(t)}
              onMarkPaid={handleMarkPaid}
              onCancel={handleCancelTask}
            />
          )}

          {/* Overdue */}
          {activeTabHost === 'overdue' && (
            <TaskList
              tasks={overdueTasks}
              emptyMessage="No overdue tasks."
              role={role}
              currentUserId={currentUserId}
              onMarkDone={(t) => setCompletingTask(t)}
              onMarkPaid={handleMarkPaid}
              onCancel={handleCancelTask}
            />
          )}

          {/* Pending Payment */}
          {activeTabHost === 'pending_payment' && (
            <div className="space-y-3">
              {pendingPaymentTasks.length === 0 ? (
                <EmptyState message="No tasks pending payment." />
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    These tasks were completed and hours were logged. Confirm payment when you&apos;ve paid.
                  </p>
                  <TaskList
                    tasks={pendingPaymentTasks}
                    emptyMessage=""
                    role={role}
                    currentUserId={currentUserId}
                    onMarkDone={(t) => setCompletingTask(t)}
                    onMarkPaid={handleMarkPaid}
                    onCancel={handleCancelTask}
                  />
                </>
              )}
            </div>
          )}

          {/* Completed History */}
          {activeTabHost === 'completed' && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              {completedTasks.length === 0 ? (
                <EmptyState message="No completed tasks yet." />
              ) : (
                completedTasks.map((t) => (
                  <CompletedTaskRow
                    key={t.id}
                    task={t}
                    role={role}
                    onMarkPaid={handleMarkPaid}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ── CLEANER VIEW ── */}
      {!isHost && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {([
              { key: 'my_tasks', label: 'My Tasks', count: myActiveTasks.length },
              { key: 'completed', label: 'Completed', count: myCompletedTasks.length },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTabCleaner(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTabCleaner === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] px-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTabCleaner === 'my_tasks' && (
            <TaskList
              tasks={myActiveTasks}
              emptyMessage="You have no assigned tasks right now."
              role={role}
              currentUserId={currentUserId}
              onMarkDone={(t) => setCompletingTask(t)}
              onMarkPaid={handleMarkPaid}
              onCancel={handleCancelTask}
            />
          )}

          {activeTabCleaner === 'completed' && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              {myCompletedTasks.length === 0 ? (
                <EmptyState message="No completed tasks yet." />
              ) : (
                myCompletedTasks.map((t) => (
                  <CompletedTaskRow
                    key={t.id}
                    task={t}
                    role={role}
                    onMarkPaid={handleMarkPaid}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            setShowCreateModal(false);
            await loadTasks();
          }}
        />
      )}

      {completingTask && (
        <CompleteTaskModal
          task={completingTask}
          onClose={() => setCompletingTask(null)}
          onCompleted={async () => {
            setCompletingTask(null);
            await loadTasks();
          }}
        />
      )}
    </div>
  );
}

// ─── TaskList helper ──────────────────────────────────────────────────────────
function TaskList({
  tasks,
  emptyMessage,
  role,
  currentUserId,
  onMarkDone,
  onMarkPaid,
  onCancel,
}: {
  tasks: Task[];
  emptyMessage: string;
  role: string;
  currentUserId: string;
  onMarkDone: (t: Task) => void;
  onMarkPaid: (t: Task) => void;
  onCancel: (t: Task) => void;
}) {
  if (tasks.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }
  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          role={role}
          currentUserId={currentUserId}
          onMarkDone={onMarkDone}
          onMarkPaid={onMarkPaid}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
