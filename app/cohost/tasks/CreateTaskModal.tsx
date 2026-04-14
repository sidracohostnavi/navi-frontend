'use client';

import { useState, useEffect } from 'react';

interface Property {
  id: string;
  name: string;
}

interface TeamMember {
  user_id: string;
  email: string;
  role: string;
  role_label: string | null;
}

interface CreateTaskModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateTaskModal({ onClose, onCreated }: CreateTaskModalProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    property_id: '',
    assigned_user_id: '',
    task_type: 'one_off' as 'one_off' | 'recurring',
    recurrence_days: 7,
    due_at: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const [propRes, memberRes] = await Promise.all([
          fetch('/api/cohost/properties'),
          fetch('/api/cohost/users/list'),
        ]);
        if (propRes.ok) {
          const d = await propRes.json();
          setProperties(d.properties || d || []);
        }
        if (memberRes.ok) {
          const d = await memberRes.json();
          setMembers((d.members || []).filter((m: any) => m.is_active && m.role !== 'owner'));
        }
      } catch {
        // non-blocking
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/cohost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          property_id: form.property_id || undefined,
          assigned_user_id: form.assigned_user_id || undefined,
          task_type: form.task_type,
          recurrence_days: form.task_type === 'recurring' ? form.recurrence_days : undefined,
          due_at: form.task_type === 'one_off' && form.due_at ? form.due_at : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Create Task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="e.g. Deep clean Farmhouse"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Add any notes or instructions..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Property */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
              <select
                value={form.property_id}
                onChange={(e) => setForm({ ...form, property_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Any / Workspace-level</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Assign to */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
              <select
                value={form.assigned_user_id}
                onChange={(e) => setForm({ ...form, assigned_user_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.email} ({m.role_label || m.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Task Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Task Type</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="task_type"
                    value="one_off"
                    checked={form.task_type === 'one_off'}
                    onChange={() => setForm({ ...form, task_type: 'one_off' })}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">One-off</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="task_type"
                    value="recurring"
                    checked={form.task_type === 'recurring'}
                    onChange={() => setForm({ ...form, task_type: 'recurring' })}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Recurring</span>
                </label>
              </div>
            </div>

            {/* Recurrence interval */}
            {form.task_type === 'recurring' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repeat every (days)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={form.recurrence_days}
                    onChange={(e) => setForm({ ...form, recurrence_days: parseInt(e.target.value) || 1 })}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-500">days after last completion</span>
                </div>
              </div>
            )}

            {/* Due date (one-off only) */}
            {form.task_type === 'one_off' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (optional)</label>
                <input
                  type="date"
                  value={form.due_at}
                  onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
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
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
