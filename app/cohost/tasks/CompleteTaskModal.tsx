'use client';

import { useState } from 'react';

interface Task {
  id: string;
  title: string;
  property_name: string | null;
  task_type: string;
  recurrence_days: number | null;
}

interface CompleteTaskModalProps {
  task: Task;
  onClose: () => void;
  onCompleted: () => void;
}

export default function CompleteTaskModal({ task, onClose, onCompleted }: CompleteTaskModalProps) {
  const [hoursWorked, setHoursWorked] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/cohost/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours_worked: hoursWorked ? parseFloat(hoursWorked) : undefined,
          completion_note: note || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete task');
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Mark Task Done</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Task summary */}
        <div className="bg-gray-50 rounded-lg p-3 mb-5">
          <p className="font-medium text-gray-800 text-sm">{task.title}</p>
          {task.property_name && (
            <p className="text-xs text-gray-500 mt-0.5">{task.property_name}</p>
          )}
          {task.task_type === 'recurring' && task.recurrence_days && (
            <p className="text-xs text-gray-400 mt-0.5">Recurring every {task.recurrence_days} days</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hours worked */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hours worked <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.25"
              value={hoursWorked}
              onChange={(e) => setHoursWorked(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Used to calculate amount owed based on your hourly rate.</p>
          </div>

          {/* Completion note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything the host should know..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Mark Done'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
