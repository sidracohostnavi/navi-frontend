'use client';

import { useState, useEffect } from 'react';

interface MemberRate {
  user_id: string;
  email: string | null;
  role: string;
  role_label: string | null;
  hourly_rate: number;
}

export default function PayRatesSection() {
  const [members, setMembers] = useState<MemberRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // user_id being saved
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // user_id → input value
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cohost/team/pay-rates');
      if (res.status === 403) {
        // Not an admin — silently hide this section
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error('Failed to load pay rates');
      const data = await res.json();
      const list: MemberRate[] = data.members || [];
      setMembers(list);
      // Init drafts from current rates
      const initDrafts: Record<string, string> = {};
      for (const m of list) {
        initDrafts[m.user_id] = m.hourly_rate > 0 ? String(m.hourly_rate) : '';
      }
      setDrafts(initDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading pay rates');
    } finally {
      setLoading(false);
    }
  };

  const saveRate = async (userId: string) => {
    const raw = drafts[userId] ?? '';
    const rate = parseFloat(raw);
    if (isNaN(rate) || rate < 0) return;

    setSaving(userId);
    try {
      const res = await fetch('/api/cohost/team/pay-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, hourly_rate: rate }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Save failed');
      }
      setSaved((prev) => new Set([...prev, userId]));
      setTimeout(() => setSaved((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      }), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save rate');
    } finally {
      setSaving(null);
    }
  };

  // If 403 or no members, render nothing (section not available to this role)
  if (!loading && members.length === 0 && !error) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mt-6">
      <h2 className="text-lg font-semibold mb-1">Pay Rates</h2>
      <p className="text-sm text-gray-500 mb-4">
        Set an hourly rate per team member. Used to calculate estimated amount owed when they log hours on completed tasks.
      </p>

      {loading && <p className="text-gray-400 text-sm">Loading...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && members.length > 0 && (
        <div className="space-y-3">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{m.email || m.user_id}</p>
                <p className="text-xs text-gray-500">{m.role_label || m.role}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    value={drafts[m.user_id] ?? ''}
                    onChange={(e) => setDrafts({ ...drafts, [m.user_id]: e.target.value })}
                    placeholder="0.00"
                    className="w-24 pl-6 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <span className="text-xs text-gray-400">/hr</span>
                <button
                  onClick={() => saveRate(m.user_id)}
                  disabled={saving === m.user_id}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving === m.user_id ? 'Saving...' : saved.has(m.user_id) ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
