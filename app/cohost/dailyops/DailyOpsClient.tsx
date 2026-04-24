'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { CheckCircle, Clock, AlertTriangle, Home, ChevronDown, ChevronUp, X, DollarSign } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cleaning {
  booking_id: string;
  property_id: string;
  property_name: string | null;
  guest_name: string;
  check_in: string;
  check_out: string;
  next_checkin: string | null;
  cleaning_window_hours: number | null;
  cleaning_window_end: string | null;
  times_missing: boolean;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_user_id: string | null;
  hours_worked: number | null;
  calculated_amount_owed: number | null;
  extra_expense_amount: number | null;
  extra_expense_description: string | null;
  completion_note: string | null;
  payment_status: 'pending_payment' | 'paid' | null;
  paid_at: string | null;
}

interface TaskCompletion {
  id: string;
  hours_worked: number | null;
  calculated_amount_owed: number | null;
  completion_note: string | null;
  completed_at: string;
  completed_by_email: string | null;
  host_payment_confirmed_at: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  property_name: string | null;
  task_type: string;
  recurrence_days: number | null;
  effective_due_at: string | null;
  is_overdue: boolean;
  assigned_user_id: string | null;
  assigned_user_email: string | null;
  status: string;
  latest_completion: TaskCompletion | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtMoney(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatWindowHours(hours: number | null): string {
  if (hours === null) return 'Set property times to see window';
  if (hours <= 0) return 'Back-to-back';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}min window`;
  if (m === 0) return `${h}hr window`;
  return `${h}hr ${m}min window`;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

// ─── Complete Cleaning Form (slide-up) ────────────────────────────────────────

function CompleteCleaningForm({
  cleaning,
  hourlyRate,
  onClose,
  onSubmit,
}: {
  cleaning: Cleaning;
  hourlyRate: number | null;
  onClose: () => void;
  onSubmit: (bookingId: string, data: {
    hours_worked?: number;
    extra_expense_amount?: number;
    extra_expense_description?: string;
    completion_note?: string;
  }) => Promise<void>;
}) {
  const [hours, setHours] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(cleaning.booking_id, {
        hours_worked: hours ? parseFloat(hours) : undefined,
        extra_expense_amount: expenseAmount ? parseFloat(expenseAmount) : undefined,
        extra_expense_description: expenseDesc.trim() || undefined,
        completion_note: note.trim() || undefined,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to submit');
      setSaving(false);
    }
  };

  // Live payment estimate
  const rateNum = hourlyRate ?? 0;
  const hoursNum = parseFloat(hours) || 0;
  const expenseNum = parseFloat(expenseAmount) || 0;
  const laborAmount = hoursNum > 0 && rateNum > 0 ? hoursNum * rateNum : 0;
  const estimatedTotal = laborAmount + expenseNum;
  const showEstimate = hoursNum > 0 || expenseNum > 0;

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Cleaning Complete</h2>
            <p className="text-xs text-gray-500 mt-0.5">{cleaning.property_name} · Guest: {cleaning.guest_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className={labelCls}>
              Hours Worked
              {hourlyRate != null && hourlyRate > 0 && (
                <span className="ml-2 text-xs font-normal text-[#008080]">Your rate: {fmtMoney(hourlyRate)}/hr</span>
              )}
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 2.5"
              value={hours}
              onChange={e => setHours(e.target.value)}
              className={inputCls}
              autoFocus
            />
            {(hourlyRate === null || hourlyRate === 0) && (
              <p className="text-xs text-gray-400 mt-1">No hourly rate set — ask your host to set your rate in team settings.</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Extra Expenses (optional)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount ($)"
                value={expenseAmount}
                onChange={e => setExpenseAmount(e.target.value)}
                className={`${inputCls} w-32`}
              />
              <input
                type="text"
                placeholder="What was it for? (e.g. cleaning supplies)"
                value={expenseDesc}
                onChange={e => setExpenseDesc(e.target.value)}
                className={`${inputCls} flex-1`}
              />
            </div>
          </div>

          {/* Live payment estimate */}
          {showEstimate && (
            <div className="px-4 py-3 bg-[#008080]/5 border border-[#008080]/20 rounded-xl text-xs space-y-1.5">
              <div className="text-[#008080] font-semibold text-sm flex items-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5" />
                Payment Estimate
              </div>
              {hoursNum > 0 && rateNum > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{hoursNum}h × {fmtMoney(rateNum)}/hr</span>
                  <span className="font-medium text-gray-800">{fmtMoney(laborAmount)}</span>
                </div>
              )}
              {hoursNum > 0 && rateNum === 0 && (
                <div className="text-amber-600">No hourly rate set — hours will be logged but no dollar amount calculated.</div>
              )}
              {expenseNum > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Expenses{expenseDesc ? ` — ${expenseDesc}` : ''}</span>
                  <span className="font-medium text-gray-800">{fmtMoney(expenseNum)}</span>
                </div>
              )}
              {estimatedTotal > 0 && (
                <div className="flex justify-between text-[#008080] font-semibold border-t border-[#008080]/20 pt-1.5 mt-0.5">
                  <span>Total to request</span>
                  <span>{fmtMoney(estimatedTotal)}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>Note (optional)</label>
            <textarea
              placeholder="Anything the host should know..."
              value={note}
              onChange={e => setNote(e.target.value)}
              className={`${inputCls} resize-none`}
              rows={2}
            />
          </div>
          <div className="pt-1">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Submitting...' : 'Submit & Mark Complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Complete Task Form (slide-up) ────────────────────────────────────────────

function CompleteTaskForm({
  task,
  hourlyRate,
  onClose,
  onSubmit,
}: {
  task: Task;
  hourlyRate: number | null;
  onClose: () => void;
  onSubmit: (taskId: string, data: { hours_worked?: number; completion_note?: string }) => Promise<void>;
}) {
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(task.id, {
        hours_worked: hours ? parseFloat(hours) : undefined,
        completion_note: note.trim() || undefined,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to submit');
      setSaving(false);
    }
  };

  const rateNum = hourlyRate ?? 0;
  const hoursNum = parseFloat(hours) || 0;
  const estimatedTotal = hoursNum > 0 && rateNum > 0 ? hoursNum * rateNum : 0;
  const showEstimate = hoursNum > 0;

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Mark Task Done</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {task.title}{task.property_name ? ` · ${task.property_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className={labelCls}>
              Hours Worked
              {hourlyRate != null && hourlyRate > 0 && (
                <span className="ml-2 text-xs font-normal text-[#008080]">Your rate: {fmtMoney(hourlyRate)}/hr</span>
              )}
            </label>
            <input
              type="number"
              min="0"
              step="0.25"
              placeholder="e.g. 2.5"
              value={hours}
              onChange={e => setHours(e.target.value)}
              className={inputCls}
              autoFocus
            />
            {(hourlyRate === null || hourlyRate === 0) && (
              <p className="text-xs text-gray-400 mt-1">No hourly rate set — hours will be logged but no dollar amount calculated.</p>
            )}
          </div>

          {/* Live estimate */}
          {showEstimate && rateNum > 0 && (
            <div className="px-4 py-3 bg-[#008080]/5 border border-[#008080]/20 rounded-xl text-xs space-y-1.5">
              <div className="text-[#008080] font-semibold text-sm flex items-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5" />
                Payment Estimate
              </div>
              <div className="flex justify-between text-gray-600">
                <span>{hoursNum}h × {fmtMoney(rateNum)}/hr</span>
                <span className="font-medium text-gray-800">{fmtMoney(estimatedTotal)}</span>
              </div>
              <div className="flex justify-between text-[#008080] font-semibold border-t border-[#008080]/20 pt-1.5 mt-0.5">
                <span>Total to request</span>
                <span>{fmtMoney(estimatedTotal)}</span>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Note (optional)</label>
            <textarea
              placeholder="Anything the host should know..."
              value={note}
              onChange={e => setNote(e.target.value)}
              className={`${inputCls} resize-none`}
              rows={2}
            />
          </div>
          <div className="pt-1">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Submitting...' : 'Mark Task Done'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Cleaning Card (cleaner view) ────────────────────────────────────────────

function CleaningCard({
  cleaning,
  onComplete,
}: {
  cleaning: Cleaning;
  onComplete: (cleaning: Cleaning) => void;
}) {
  const today = isToday(cleaning.check_out);
  const windowStr = formatWindowHours(cleaning.cleaning_window_hours);
  const tight = cleaning.cleaning_window_hours !== null && cleaning.cleaning_window_hours < 4;
  const isPaid = cleaning.payment_status === 'paid';
  const isPending = cleaning.payment_status === 'pending_payment';
  const awaitingHours = cleaning.is_completed && !cleaning.payment_status;

  const statusBadge = () => {
    if (isPaid) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" />Paid</span>;
    if (isPending) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Payment Pending</span>;
    if (awaitingHours) return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" />Done</span>;
    if (today) return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Today</span>;
    return null;
  };

  const borderColor = isPaid
    ? 'border-green-200 bg-green-50/20'
    : isPending
    ? 'border-amber-200 bg-amber-50/10'
    : cleaning.is_completed
    ? 'border-blue-200 bg-blue-50/10'
    : today
    ? 'border-orange-200'
    : 'border-gray-200';

  return (
    <div className={`bg-white border rounded-xl p-4 ${borderColor}`}>
      {/* Missing times warning */}
      {cleaning.times_missing && !cleaning.is_completed && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>Check-in/out times not set.</span>
          <Link
            href={`/cohost/properties/${cleaning.property_id}/settings`}
            className="ml-auto font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
          >
            Set times →
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-semibold text-gray-900">{cleaning.property_name || 'Unknown Property'}</span>
            {statusBadge()}
            {tight && !cleaning.is_completed && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Tight turnaround</span>
            )}
          </div>

          <div className="text-sm text-gray-500 space-y-1">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              <span>Checkout: <span className="text-gray-700 font-medium">{fmtDate(cleaning.check_out)} at {fmtTime(cleaning.check_out)}</span></span>
              {cleaning.cleaning_window_end && (
                <span>Clean by: <span className="text-gray-700 font-medium">{fmtDate(cleaning.cleaning_window_end)} at {fmtTime(cleaning.cleaning_window_end)}</span></span>
              )}
            </div>
            {!cleaning.is_completed && (
              <div className={`flex items-center gap-1 text-xs ${tight ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                <Clock className="w-3 h-3" />
                {windowStr}
              </div>
            )}
          </div>

          {/* Completion details */}
          {cleaning.is_completed && (
            <div className="mt-2 text-xs text-gray-500 space-y-0.5">
              {cleaning.completed_at && <div>Completed: {fmtDateTime(cleaning.completed_at)}</div>}
              {cleaning.hours_worked !== null && (
                <div>Hours: <span className="font-medium text-gray-700">{cleaning.hours_worked}h</span></div>
              )}
              {cleaning.extra_expense_amount !== null && cleaning.extra_expense_amount > 0 && (
                <div>Expenses: <span className="font-medium text-gray-700">{fmtMoney(cleaning.extra_expense_amount)}{cleaning.extra_expense_description ? ` — ${cleaning.extra_expense_description}` : ''}</span></div>
              )}
              {cleaning.calculated_amount_owed !== null && cleaning.calculated_amount_owed > 0 && (
                <div className={`font-medium ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>
                  {isPaid ? 'Paid' : 'Owed'}: {fmtMoney(cleaning.calculated_amount_owed)}
                </div>
              )}
              {isPaid && cleaning.paid_at && (
                <div className="text-green-600">Payment confirmed {fmtDateTime(cleaning.paid_at)}</div>
              )}
              {cleaning.completion_note && (
                <div className="text-gray-400 italic">"{cleaning.completion_note}"</div>
              )}
            </div>
          )}
        </div>

        {/* Mark Complete button — only for not-yet-completed cleanings */}
        {!cleaning.is_completed && (
          <button
            onClick={() => onComplete(cleaning)}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            Mark Done
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Task Card (cleaner view) ─────────────────────────────────────────────────

function TaskCard({
  task,
  onComplete,
  completing,
}: {
  task: Task;
  onComplete: (task: Task) => void;
  completing: string | null;
}) {
  const lc = task.latest_completion;
  const isPaid = !!(lc?.host_payment_confirmed_at);
  const isPendingPayment = !!(lc && lc.calculated_amount_owed != null && lc.calculated_amount_owed > 0 && !lc.host_payment_confirmed_at);
  const isCompletedNoPay = !!(lc && !lc.calculated_amount_owed);
  // One-off tasks can't be redone once completed; recurring tasks always show the button
  const canComplete = !lc || task.task_type === 'recurring';

  const statusBadge = () => {
    if (isPaid) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" />Paid</span>;
    if (isPendingPayment) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Payment Pending</span>;
    if (isCompletedNoPay) return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" />Done</span>;
    return null;
  };

  const borderColor = isPaid
    ? 'border-green-200 bg-green-50/20'
    : isPendingPayment
    ? 'border-amber-200 bg-amber-50/10'
    : isCompletedNoPay
    ? 'border-blue-200 bg-blue-50/10'
    : task.is_overdue
    ? 'border-red-200'
    : 'border-gray-200';

  return (
    <div className={`bg-white border rounded-xl p-4 ${borderColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-semibold text-gray-900">{task.title}</span>
            {statusBadge()}
            {task.is_overdue && !lc && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Overdue
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 space-y-0.5">
            {task.property_name && (
              <div className="flex items-center gap-1"><Home className="w-3 h-3" />{task.property_name}</div>
            )}
            {task.description && <div className="text-gray-400">{task.description}</div>}
            {task.effective_due_at && !lc && (
              <div className={task.is_overdue ? 'text-red-600 font-medium' : ''}>
                Due: {fmtDate(task.effective_due_at)}
              </div>
            )}
            {task.task_type === 'recurring' && task.effective_due_at && (
              <div className="text-gray-400">
                Next due: {fmtDate(task.effective_due_at)}
                {task.recurrence_days && <span className="ml-1">· every {task.recurrence_days} days</span>}
              </div>
            )}
          </div>

          {/* Completion details */}
          {lc && (
            <div className="mt-2 text-xs text-gray-500 space-y-0.5">
              <div>Completed: <span className="text-gray-700">{fmtDateTime(lc.completed_at)}</span></div>
              {lc.hours_worked != null && (
                <div>Hours: <span className="font-medium text-gray-700">{lc.hours_worked}h</span></div>
              )}
              {lc.calculated_amount_owed != null && lc.calculated_amount_owed > 0 && (
                <div className={`font-medium ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>
                  {isPaid ? 'Paid' : 'Owed'}: {fmtMoney(lc.calculated_amount_owed)}
                </div>
              )}
              {lc.completion_note && (
                <div className="text-gray-400 italic">"{lc.completion_note}"</div>
              )}
            </div>
          )}
        </div>

        {canComplete && (
          <button
            onClick={() => onComplete(task)}
            disabled={completing === task.id}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {completing === task.id ? 'Saving...' : 'Mark Done'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title,
  count,
  children,
  defaultOpen = true,
  accent,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors: Record<string, string> = {
    orange: 'text-orange-600',
    red: 'text-red-600',
    green: 'text-green-700',
    amber: 'text-amber-600',
    gray: 'text-gray-500',
  };
  const color = accent ? (colors[accent] || 'text-gray-700') : 'text-gray-700';

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${color}`}>
          {title} <span className="text-gray-400 font-normal normal-case">({count})</span>
        </h3>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
      {message}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DailyOpsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<'active' | 'paid'>('active');
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [completeFormCleaning, setCompleteFormCleaning] = useState<Cleaning | null>(null);
  const [completeFormTask, setCompleteFormTask] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cohost/dailyops/summary');
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to load');
      }
      const data = await res.json();
      setCleanings(data.cleanings || []);
      setTasks(data.tasks || []);
      setHourlyRate(data.hourlyRate ?? null);
    } catch (e: any) {
      setError(e.message || 'Failed to load Daily Ops');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmitCleaning = async (bookingId: string, formData: {
    hours_worked?: number;
    extra_expense_amount?: number;
    extra_expense_description?: string;
    completion_note?: string;
  }) => {
    const res = await fetch(`/api/cohost/dailyops/cleanings/${bookingId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Failed');
    }
    setCompleteFormCleaning(null);
    await load();
  };

  const handleSubmitTask = async (taskId: string, formData: { hours_worked?: number; completion_note?: string }) => {
    const res = await fetch(`/api/cohost/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Failed');
    }
    setCompleteFormTask(null);
    await load();
  };

  // Derived cleaning lists
  const activeCleanings = cleanings.filter(c => !c.is_completed);
  const completedPendingCleanings = cleanings.filter(c => c.is_completed && c.payment_status !== 'paid');
  const paidCleanings = cleanings.filter(c => c.payment_status === 'paid');

  // Derived task lists
  // "Needs doing": no completion yet (one_off) or recurring tasks (always completable)
  const pendingTasks = tasks.filter(t => !t.latest_completion || t.task_type === 'recurring');
  // Completed one_off tasks awaiting or confirmed payment
  const completedPendingTasks = tasks.filter(t =>
    t.task_type === 'one_off' &&
    t.latest_completion &&
    !t.latest_completion.host_payment_confirmed_at
  );
  const paidTasks = tasks.filter(t =>
    t.task_type === 'one_off' &&
    t.latest_completion?.host_payment_confirmed_at
  );

  const pendingPaymentCount =
    cleanings.filter(c => c.payment_status === 'pending_payment').length +
    completedPendingTasks.filter(t => t.latest_completion?.calculated_amount_owed).length;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-100 rounded-xl" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Ops</h1>
        <p className="text-sm text-gray-500">Your upcoming cleanings and assigned tasks</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('active')}
          className={`relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-blue-500 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Active
          {pendingPaymentCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-amber-500 rounded-full">
              {pendingPaymentCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('paid')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'paid'
              ? 'border-blue-500 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Paid
        </button>
      </div>

      {/* ACTIVE TAB */}
      {activeTab === 'active' && (
        <div>
          {/* Upcoming cleanings (not yet done) */}
          <Section title="Upcoming Cleanings" count={activeCleanings.length} accent="orange">
            {activeCleanings.length === 0
              ? <EmptyState message="No upcoming cleanings assigned to you." />
              : activeCleanings.map(c => (
                <CleaningCard key={c.booking_id} cleaning={c} onComplete={setCompleteFormCleaning} />
              ))
            }
          </Section>

          {/* Completed cleanings awaiting payment */}
          {completedPendingCleanings.length > 0 && (
            <Section title="Completed — Awaiting Payment" count={completedPendingCleanings.length} accent="amber">
              {completedPendingCleanings.map(c => (
                <CleaningCard key={c.booking_id} cleaning={c} onComplete={setCompleteFormCleaning} />
              ))}
            </Section>
          )}

          {/* My Tasks — needs doing */}
          <Section title="My Tasks" count={pendingTasks.length} accent="gray" defaultOpen={true}>
            {pendingTasks.length === 0
              ? <EmptyState message="No tasks assigned to you." />
              : pendingTasks.map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onComplete={setCompleteFormTask}
                  completing={completingTask}
                />
              ))
            }
          </Section>

          {/* Completed tasks awaiting payment */}
          {completedPendingTasks.length > 0 && (
            <Section title="Completed Tasks — Awaiting Payment" count={completedPendingTasks.length} accent="amber">
              {completedPendingTasks.map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onComplete={setCompleteFormTask}
                  completing={completingTask}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {/* PAID TAB */}
      {activeTab === 'paid' && (
        <div>
          {paidCleanings.length === 0 && paidTasks.length === 0 ? (
            <EmptyState message="No paid work yet. Completed cleanings and tasks will appear here once your host marks them as paid." />
          ) : (
            <div className="space-y-6">
              {paidCleanings.length > 0 && (
                <Section title="Paid Cleanings" count={paidCleanings.length} accent="green">
                  {paidCleanings.map(c => (
                    <CleaningCard key={c.booking_id} cleaning={c} onComplete={setCompleteFormCleaning} />
                  ))}
                </Section>
              )}
              {paidTasks.length > 0 && (
                <Section title="Paid Tasks" count={paidTasks.length} accent="green">
                  {paidTasks.map(t => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onComplete={setCompleteFormTask}
                      completing={completingTask}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      )}

      {/* Complete Cleaning Form */}
      {completeFormCleaning && (
        <CompleteCleaningForm
          cleaning={completeFormCleaning}
          hourlyRate={hourlyRate}
          onClose={() => setCompleteFormCleaning(null)}
          onSubmit={handleSubmitCleaning}
        />
      )}

      {/* Complete Task Form */}
      {completeFormTask && (
        <CompleteTaskForm
          task={completeFormTask}
          hourlyRate={hourlyRate}
          onClose={() => setCompleteFormTask(null)}
          onSubmit={handleSubmitTask}
        />
      )}
    </div>
  );
}
