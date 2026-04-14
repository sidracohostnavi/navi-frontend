'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle, Clock, AlertTriangle, Home, Plus, ChevronDown, ChevronUp,
  ClipboardList, RotateCcw, X, Calendar,
} from 'lucide-react';
import Link from 'next/link';
import CompleteTaskModal from '../tasks/CompleteTaskModal';

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
  times_missing: boolean;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_user_id: string | null;
  completed_by_email: string | null;
  hours_worked: number | null;
  calculated_amount_owed: number | null;
  extra_expense_amount: number | null;
  extra_expense_description: string | null;
  completion_note: string | null;
  payment_status: 'pending_payment' | 'paid' | null;
  paid_at: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  property_name: string | null;
  property_id: string | null;
  task_type: string;
  recurrence_days: number | null;
  effective_due_at: string | null;
  is_overdue: boolean;
  assigned_user_id: string | null;
  assigned_user_email: string | null;
  status: string;
  latest_completion: any | null;
}

interface CompletedTask {
  id: string;
  task_id: string;
  task_title: string | null;
  property_name: string | null;
  completed_at: string;
  completed_by_email: string | null;
  hours_worked: number | null;
  calculated_amount_owed: number | null;
  completion_note: string | null;
}

interface TeamMember {
  user_id: string;
  email: string;
  role: string;
}

interface Property {
  id: string;
  name: string;
}

interface Stats {
  propertyCount: number;
  upcomingBookings: number;
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

function getDateKey(iso: string) {
  return iso.split('T')[0];
}

function getDateHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (d.toDateString() === today.toDateString()) return `Today · ${dateStr}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${dateStr}`;
  return dateStr;
}

function fmtCleaningWindow(checkOut: string, windowHours: number | null): string {
  const from = fmtTime(checkOut);
  if (windowHours === null || windowHours <= 0) return from;
  const endMs = new Date(checkOut).getTime() + windowHours * 3_600_000;
  return `${from} – ${fmtTime(new Date(endMs).toISOString())}`;
}

function isTodayDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={confirmClass || 'px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Creation Modal ──────────────────────────────────────────────────────

function TaskModal({
  properties,
  teamMembers,
  onClose,
  onCreated,
}: {
  properties: Property[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    property_id: '',
    assigned_user_id: '',
    task_type: 'one_off' as 'one_off' | 'recurring',
    due_at: '',
    recurrence_days: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        property_id: form.property_id || null,
        assigned_user_id: form.assigned_user_id || null,
        task_type: form.task_type,
      };
      if (form.task_type === 'one_off' && form.due_at) {
        body.due_at = new Date(form.due_at).toISOString();
      }
      if (form.task_type === 'recurring' && form.recurrence_days) {
        body.recurrence_days = parseInt(form.recurrence_days);
      }
      const res = await fetch('/api/cohost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create task');
      }
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">New Task</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className={labelCls}>Task Title *</label>
            <input
              type="text"
              placeholder="e.g. Replace pool filter, Restock toiletries..."
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              placeholder="Any extra details or instructions..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className={`${inputCls} resize-none`}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Property</label>
              <select
                value={form.property_id}
                onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">All properties</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Assign To</label>
              <select
                value={form.assigned_user_id}
                onChange={e => setForm(f => ({ ...f, assigned_user_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.email}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Task Type</label>
            <div className="flex gap-2">
              {(['one_off', 'recurring'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, task_type: t }))}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium border transition-colors ${
                    form.task_type === t
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {t === 'one_off' ? 'One-off' : 'Recurring'}
                </button>
              ))}
            </div>
          </div>
          {form.task_type === 'one_off' && (
            <div>
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                value={form.due_at}
                onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
                className={inputCls}
              />
            </div>
          )}
          {form.task_type === 'recurring' && (
            <div>
              <label className={labelCls}>Repeat Every (days)</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 7 for weekly"
                value={form.recurrence_days}
                onChange={e => setForm(f => ({ ...f, recurrence_days: e.target.value }))}
                className={inputCls}
              />
            </div>
          )}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-[#008080] text-white text-sm font-medium rounded-lg hover:bg-[#006666] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Cleaning Row (within a date group) ──────────────────────────────────────

function CleaningRow({
  cleaning,
  onMarkPaid,
  onRevertPaid,
  updating,
}: {
  cleaning: Cleaning;
  onMarkPaid: (bookingId: string) => void;
  onRevertPaid: (bookingId: string) => void;
  updating: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPaid = cleaning.payment_status === 'paid';
  const isPendingPayment = cleaning.payment_status === 'pending_payment';
  const isCompleted = cleaning.is_completed;
  const awaitingHours = isCompleted && !cleaning.payment_status;
  const tight = cleaning.cleaning_window_hours !== null && cleaning.cleaning_window_hours < 4;
  const isUpdating = updating === cleaning.booking_id;

  const today = isTodayDate(cleaning.check_out);

  const statusBadge = () => {
    if (isPaid) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Paid</span>;
    if (isPendingPayment) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Pending payment</span>;
    if (awaitingHours) return <span className="text-xs px-2 py-0.5 rounded-full bg-[#008080]/10 text-[#008080] font-medium">Awaiting hours</span>;
    if (today) return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Today</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Upcoming</span>;
  };

  return (
    <div className={`border-t border-gray-100 first:border-t-0 ${isPendingPayment ? 'bg-amber-50/30' : isPaid ? 'bg-green-50/20' : ''}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Property name + window */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">{cleaning.property_name || 'Unknown'}</span>
            {statusBadge()}
            {tight && !isCompleted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Tight</span>
            )}
          </div>
          {cleaning.times_missing ? (
            <div className="flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              <Link
                href={`/cohost/properties/${cleaning.property_id}/settings`}
                className="text-xs text-amber-600 underline underline-offset-2"
              >
                Set cleaning times
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
              <Clock className="w-3 h-3 shrink-0" />
              <span className={tight && !isCompleted ? 'text-red-500 font-medium' : ''}>
                {fmtCleaningWindow(cleaning.check_out, cleaning.cleaning_window_hours)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isPendingPayment && (
            <button
              onClick={() => onMarkPaid(cleaning.booking_id)}
              disabled={isUpdating}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#008080] rounded-lg hover:bg-[#006666] disabled:opacity-50 transition-colors"
            >
              {isUpdating ? '...' : 'Mark paid'}
            </button>
          )}
          {isPaid && (
            <button
              onClick={() => onRevertPaid(cleaning.booking_id)}
              disabled={isUpdating}
              className="px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              title="Revert payment"
            >
              <RotateCcw className="w-3 h-3" />
              Revert
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-100 space-y-1 text-xs text-gray-500">
          {!isCompleted && (
            <div className="text-gray-400 italic">Not yet marked complete by cleaner.</div>
          )}
          {isCompleted && cleaning.completed_by_email && (
            <div>Cleaned by <span className="text-gray-700 font-medium">{cleaning.completed_by_email}</span>
              {cleaning.completed_at && <span className="text-gray-400"> · {fmtDateTime(cleaning.completed_at)}</span>}
            </div>
          )}
          {isCompleted && cleaning.hours_worked !== null && (
            <div className="flex items-center gap-3">
              <span>{cleaning.hours_worked}h worked</span>
              {cleaning.extra_expense_amount !== null && cleaning.extra_expense_amount > 0 && (
                <span>{fmtMoney(cleaning.extra_expense_amount)} expenses{cleaning.extra_expense_description ? ` — ${cleaning.extra_expense_description}` : ''}</span>
              )}
            </div>
          )}
          {isCompleted && cleaning.calculated_amount_owed !== null && cleaning.calculated_amount_owed > 0 && (
            <div className={`font-medium ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>
              {fmtMoney(cleaning.calculated_amount_owed)} owed
              {isPaid && cleaning.paid_at && <span className="font-normal"> · Paid {fmtDateTime(cleaning.paid_at)}</span>}
            </div>
          )}
          {awaitingHours && <div className="text-[#008080]">Waiting for cleaner to submit hours</div>}
          {isCompleted && cleaning.completion_note && <div className="text-gray-400 italic">"{cleaning.completion_note}"</div>}
        </div>
      )}
    </div>
  );
}

// ─── Date Group Card ──────────────────────────────────────────────────────────

function DateGroupCard({
  dateKey,
  cleanings,
  onMarkPaid,
  onRevertPaid,
  updating,
}: {
  dateKey: string;
  cleanings: Cleaning[];
  onMarkPaid: (bookingId: string) => void;
  onRevertPaid: (bookingId: string) => void;
  updating: string | null;
}) {
  const heading = getDateHeading(dateKey + 'T00:00:00');
  const hasPending = cleanings.some(c => c.payment_status === 'pending_payment');
  const allPaid = cleanings.every(c => c.payment_status === 'paid');
  const isToday = isTodayDate(dateKey + 'T12:00:00');

  const borderColor = allPaid
    ? 'border-green-200'
    : hasPending
    ? 'border-amber-300'
    : isToday
    ? 'border-[#008080]'
    : 'border-gray-200';

  const headerBg = allPaid
    ? 'border-green-100 bg-green-50'
    : hasPending
    ? 'border-amber-100 bg-amber-50'
    : isToday
    ? 'border-[#008080]/30 bg-[#008080]/10'
    : 'border-gray-100 bg-gray-50';

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${borderColor}`}>
      {/* Date heading */}
      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${headerBg}`}>
        <span className={`text-sm font-semibold ${isToday ? 'text-[#008080]' : allPaid ? 'text-green-800' : hasPending ? 'text-amber-800' : 'text-gray-800'}`}>{heading}</span>
        <span className="text-xs text-gray-400">{cleanings.length} {cleanings.length === 1 ? 'cleaning' : 'cleanings'}</span>
      </div>
      {/* Rows */}
      <div>
        {cleanings.map(c => (
          <CleaningRow
            key={c.booking_id}
            cleaning={c}
            onMarkPaid={onMarkPaid}
            onRevertPaid={onRevertPaid}
            updating={updating}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Task Card (host view) ────────────────────────────────────────────────────

function HostTaskCard({
  task,
  onMarkDone,
  onMarkPaid,
  onCancel,
  payingId,
}: {
  task: Task;
  onMarkDone: (task: Task) => void;
  onMarkPaid: (task: Task) => void;
  onCancel: (task: Task) => void;
  payingId: string | null;
}) {
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const overdue = task.is_overdue;

  const hasPendingPayment = !!(
    task.latest_completion?.calculated_amount_owed &&
    !task.latest_completion?.host_payment_confirmed_at
  );

  // Host can mark done if task is active and either has no completion or is recurring
  const canMarkDone =
    task.status === 'active' &&
    (!task.latest_completion || task.task_type === 'recurring');

  const handleCancelConfirmed = async () => {
    setCancelling(true);
    await onCancel(task);
    setCancelling(false);
    setCancelConfirm(false);
  };

  return (
    <div
      className={`bg-white border rounded-xl p-4 ${
        overdue ? 'border-red-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-semibold text-gray-900">{task.title}</span>
            {task.task_type === 'recurring' && task.recurrence_days && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Every {task.recurrence_days}d
              </span>
            )}
            {overdue && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Overdue
              </span>
            )}
            {hasPendingPayment && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                Pending payment
              </span>
            )}
          </div>

          <div className="text-xs text-gray-500 space-y-0.5">
            {task.property_name && (
              <div className="flex items-center gap-1">
                <Home className="w-3 h-3" />{task.property_name}
              </div>
            )}
            {task.assigned_user_email && (
              <div>Assigned: {task.assigned_user_email}</div>
            )}
            {task.effective_due_at && (
              <div className={overdue ? 'text-red-600 font-medium' : ''}>
                <Calendar className="w-3 h-3 inline mr-0.5" />
                Due: {fmtDate(task.effective_due_at)}
              </div>
            )}
            {task.description && (
              <div className="text-gray-400 truncate">{task.description}</div>
            )}
          </div>

          {/* Last completion summary */}
          {task.latest_completion && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
              Last done:{' '}
              <span className="text-gray-700 font-medium">
                {fmtDateTime(task.latest_completion.completed_at)}
              </span>
              {task.latest_completion.completed_by_email &&
                ` by ${task.latest_completion.completed_by_email}`}
              {task.latest_completion.hours_worked !== null && (
                <> · <span className="font-medium">{task.latest_completion.hours_worked}h</span></>
              )}
              {task.latest_completion.calculated_amount_owed !== null && (
                <>
                  {' '}·{' '}
                  <span
                    className={
                      task.latest_completion.host_payment_confirmed_at
                        ? 'text-green-600 font-medium'
                        : 'text-amber-600 font-medium'
                    }
                  >
                    {fmtMoney(task.latest_completion.calculated_amount_owed)}
                    {task.latest_completion.host_payment_confirmed_at ? ' (paid)' : ' owed'}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 items-end shrink-0">
          {canMarkDone && (
            <button
              onClick={() => onMarkDone(task)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Mark Done
            </button>
          )}
          {hasPendingPayment && (
            <button
              onClick={() => onMarkPaid(task)}
              disabled={payingId === task.id}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#008080] rounded-lg hover:bg-[#006666] disabled:opacity-50 transition-colors"
            >
              {payingId === task.id ? 'Saving...' : 'Mark Paid'}
            </button>
          )}
          {task.status === 'active' && (
            cancelConfirm ? (
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
            )
          )}
        </div>
      </div>
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

export default function DashboardClient({ stats }: { stats: Stats }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Top-level tab: cleanings vs tasks
  const [mainTab, setMainTab] = useState<'cleanings' | 'tasks'>('cleanings');
  // Cleaning sub-tab
  const [cleaningTab, setCleaningTab] = useState<'active' | 'paid'>('active');
  // Task sub-tab
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');

  const [updatingCleaning, setUpdatingCleaning] = useState<string | null>(null);
  const [confirmPaid, setConfirmPaid] = useState<Cleaning | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<Cleaning | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [payingTaskId, setPayingTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, propertiesRes, teamRes] = await Promise.all([
        fetch('/api/cohost/dailyops/summary'),
        fetch('/api/cohost/properties'),
        fetch('/api/cohost/users/list'),
      ]);

      if (!summaryRes.ok) {
        const d = await summaryRes.json();
        throw new Error(d.error || 'Failed to load');
      }

      const summary = await summaryRes.json();
      setCleanings(summary.cleanings || []);
      setTasks(summary.tasks || []);
      setCompletedTasks(summary.completedTasks || []);

      if (propertiesRes.ok) {
        const pd = await propertiesRes.json();
        setProperties((pd.properties || pd || []).map((p: any) => ({ id: p.id, name: p.name })));
      }

      if (teamRes.ok) {
        const td = await teamRes.json();
        const members = td.members || td || [];
        setTeamMembers(
          members
            .filter((m: any) => m.is_active && m.email)
            .map((m: any) => ({ user_id: m.user_id || m.id, email: m.email, role: m.role }))
        );
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePaymentStatus = async (bookingId: string, status: 'paid' | 'pending_payment') => {
    setUpdatingCleaning(bookingId);
    try {
      const res = await fetch(`/api/cohost/dailyops/cleanings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: status }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed to update payment status');
    } finally {
      setUpdatingCleaning(null);
    }
  };

  const handleMarkPaidTask = async (task: Task) => {
    if (!task.latest_completion) return;
    setPayingTaskId(task.id);
    try {
      const res = await fetch(`/api/cohost/tasks/${task.id}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion_id: task.latest_completion.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to mark as paid');
      }
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed to mark as paid');
    } finally {
      setPayingTaskId(null);
    }
  };

  const handleCancelTask = async (task: Task) => {
    await fetch(`/api/cohost/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled', is_active: false }),
    });
    await load();
  };

  // Derived lists
  const activeCleanings = cleanings.filter(c => c.payment_status !== 'paid');
  const paidCleanings = cleanings.filter(c => c.payment_status === 'paid');
  const pendingPaymentCount = cleanings.filter(c => c.payment_status === 'pending_payment').length;
  const pendingTasks = tasks.filter(t => t.status !== 'cancelled');
  const overdueTasks = pendingTasks.filter(t => t.is_overdue);

  // Group cleanings by checkout date
  function groupByDate(list: Cleaning[]): [string, Cleaning[]][] {
    const map = new Map<string, Cleaning[]>();
    for (const c of list) {
      const key = getDateKey(c.check_out);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 bg-[#008080]/10 rounded-xl" />
            <div className="h-20 bg-[#008080]/10 rounded-xl" />
          </div>
          <div className="h-10 bg-gray-100 rounded-xl w-48" />
          <div className="h-40 bg-gray-100 rounded-xl" />
          <div className="h-40 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-[#008080]/10 rounded-xl border-2 border-[#008080]/40 p-4">
          <div className="text-xs text-[#008080]/70 font-medium mb-1 uppercase tracking-wide">Properties</div>
          <div className="text-2xl font-bold text-[#008080]">{stats.propertyCount}</div>
        </div>
        <div className="bg-[#008080]/10 rounded-xl border-2 border-[#008080]/40 p-4">
          <div className="text-xs text-[#008080]/70 font-medium mb-1 uppercase tracking-wide">Upcoming Bookings</div>
          <div className="text-2xl font-bold text-[#008080]">{stats.upcomingBookings}</div>
        </div>
      </div>

      {/* ── Main tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setMainTab('cleanings')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            mainTab === 'cleanings'
              ? 'border-2 border-[#008080] text-[#008080] bg-white'
              : 'border-2 border-gray-200 text-gray-500 bg-white hover:border-gray-300 hover:text-gray-700'
          }`}
        >
          Cleanings ({cleanings.length})
          {pendingPaymentCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-amber-500 rounded-full">
              {pendingPaymentCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setMainTab('tasks')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            mainTab === 'tasks'
              ? 'border-2 border-[#008080] text-[#008080] bg-white'
              : 'border-2 border-gray-200 text-gray-500 bg-white hover:border-gray-300 hover:text-gray-700'
          }`}
        >
          Tasks ({tasks.length})
          {overdueTasks.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
              {overdueTasks.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Cleanings panel ────────────────────────────────────────────────── */}
      {mainTab === 'cleanings' && (
        <div>
          {/* Sub-tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-5 w-fit">
            <button
              onClick={() => setCleaningTab('active')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                cleaningTab === 'active' ? 'bg-[#008080] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
              onClick={() => setCleaningTab('paid')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                cleaningTab === 'paid' ? 'bg-[#008080] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Paid
            </button>
          </div>

          {cleaningTab === 'active' && (
            <div className="space-y-3">
              {activeCleanings.length === 0 ? (
                <EmptyState message="No upcoming cleanings in the next 30 days." />
              ) : (
                groupByDate(activeCleanings).map(([dateKey, group]) => (
                  <DateGroupCard
                    key={dateKey}
                    dateKey={dateKey}
                    cleanings={group}
                    onMarkPaid={(id) => {
                      const cl = cleanings.find(x => x.booking_id === id);
                      if (cl) setConfirmPaid(cl);
                    }}
                    onRevertPaid={(id) => {
                      const cl = cleanings.find(x => x.booking_id === id);
                      if (cl) setConfirmRevert(cl);
                    }}
                    updating={updatingCleaning}
                  />
                ))
              )}
            </div>
          )}

          {cleaningTab === 'paid' && (
            <div className="space-y-3">
              {paidCleanings.length === 0 ? (
                <EmptyState message="No paid cleanings yet." />
              ) : (
                groupByDate(paidCleanings).map(([dateKey, group]) => (
                  <DateGroupCard
                    key={dateKey}
                    dateKey={dateKey}
                    cleanings={group}
                    onMarkPaid={(id) => {
                      const cl = cleanings.find(x => x.booking_id === id);
                      if (cl) setConfirmPaid(cl);
                    }}
                    onRevertPaid={(id) => {
                      const cl = cleanings.find(x => x.booking_id === id);
                      if (cl) setConfirmRevert(cl);
                    }}
                    updating={updatingCleaning}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tasks panel ────────────────────────────────────────────────────── */}
      {mainTab === 'tasks' && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setTaskTab('pending')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  taskTab === 'pending' ? 'bg-[#008080] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setTaskTab('completed')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  taskTab === 'completed' ? 'bg-[#008080] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Completed
              </button>
            </div>
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#008080] rounded-lg hover:bg-[#006666] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
            </button>
          </div>

          {taskTab === 'pending' && (
            <div className="space-y-2">
              {overdueTasks.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-2">Overdue ({overdueTasks.length})</div>
                  <div className="space-y-2">
                    {overdueTasks.map(t => (
                    <HostTaskCard key={t.id} task={t} onMarkDone={setCompletingTask} onMarkPaid={handleMarkPaidTask} onCancel={handleCancelTask} payingId={payingTaskId} />
                  ))}
                  </div>
                </div>
              )}
              {pendingTasks.filter(t => !t.is_overdue).length > 0 ? (
                <div>
                  {overdueTasks.length > 0 && (
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                      Upcoming ({pendingTasks.filter(t => !t.is_overdue).length})
                    </div>
                  )}
                  <div className="space-y-2">
                    {pendingTasks.filter(t => !t.is_overdue).map(t => (
                    <HostTaskCard key={t.id} task={t} onMarkDone={setCompletingTask} onMarkPaid={handleMarkPaidTask} onCancel={handleCancelTask} payingId={payingTaskId} />
                  ))}
                  </div>
                </div>
              ) : overdueTasks.length === 0 ? (
                <EmptyState message="No pending tasks." />
              ) : null}
            </div>
          )}

          {taskTab === 'completed' && (
            <div className="space-y-2">
              {completedTasks.length === 0 ? (
                <EmptyState message="No completed tasks this month." />
              ) : (
                completedTasks.map(c => (
                  <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <ClipboardList className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="font-semibold text-gray-900 text-sm">{c.task_title || 'Task'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Done</span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {c.property_name && <div className="flex items-center gap-1"><Home className="w-3 h-3" />{c.property_name}</div>}
                        <div>Completed: {fmtDateTime(c.completed_at)}</div>
                        {c.completed_by_email && <div>By: {c.completed_by_email}</div>}
                        {c.hours_worked && (
                          <div>
                            {c.hours_worked}h worked
                            {c.calculated_amount_owed ? ` · ${fmtMoney(c.calculated_amount_owed)} owed` : ''}
                          </div>
                        )}
                        {c.completion_note && <div className="text-gray-400 italic">"{c.completion_note}"</div>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      {confirmPaid && (
        <ConfirmDialog
          title="Mark cleaning as paid?"
          message={`This will record that you've paid ${confirmPaid.completed_by_email || 'the cleaner'}${confirmPaid.calculated_amount_owed ? ` ${fmtMoney(confirmPaid.calculated_amount_owed)}` : ''} for ${confirmPaid.property_name}. This can be reverted if needed.`}
          confirmLabel="Mark Paid"
          confirmClass="px-4 py-2 text-sm font-medium text-white bg-[#008080] rounded-lg hover:bg-[#006666] transition-colors"
          onConfirm={() => {
            handlePaymentStatus(confirmPaid.booking_id, 'paid');
            setConfirmPaid(null);
          }}
          onCancel={() => setConfirmPaid(null)}
        />
      )}

      {confirmRevert && (
        <ConfirmDialog
          title="Revert payment status?"
          message={`This will move ${confirmRevert.property_name} back to 'Pending Payment'. Use this if payment was recorded by mistake.`}
          confirmLabel="Revert to Pending"
          confirmClass="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
          onConfirm={() => {
            handlePaymentStatus(confirmRevert.booking_id, 'pending_payment');
            setConfirmRevert(null);
          }}
          onCancel={() => setConfirmRevert(null)}
        />
      )}

      {showTaskModal && (
        <TaskModal
          properties={properties}
          teamMembers={teamMembers}
          onClose={() => setShowTaskModal(false)}
          onCreated={() => {
            setShowTaskModal(false);
            load();
          }}
        />
      )}

      {completingTask && (
        <CompleteTaskModal
          task={completingTask}
          onClose={() => setCompletingTask(null)}
          onCompleted={() => {
            setCompletingTask(null);
            load();
          }}
        />
      )}
    </div>
  );
}
