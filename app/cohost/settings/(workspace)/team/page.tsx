'use client';

import React, { useEffect, useState } from 'react';
import { ASSIGNABLE_ROLES, ROLE_LABELS, type Role } from '@/lib/roles/roleConfig';
import { useSessionRefresh } from '@/lib/hooks/useSessionRefresh';
import ManagePropertiesModal from './ManagePropertiesModal';
import { Key } from 'lucide-react';

export default function TeamSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [apiFailed, setApiFailed] = useState(false);

  // Refresh session when tab regains focus (prevents stale sessions in multi-window)
  useSessionRefresh();

  const [form, setForm] = useState({
    invitee_name: '',
    invitee_email: '',
    role: 'cleaner' as Role,
    can_view_calendar: true,
    can_view_guest_name: true,
    can_view_guest_count: true,
    can_view_booking_notes: false,
    can_view_contact_info: false,
  });

  // New State for Persistent Invite Links
  const [localInviteUrls, setLocalInviteUrls] = useState<Record<string, string>>({});

  // Property Management Modal State
  const [managingUser, setManagingUser] = useState<{ id: string, name: string } | null>(null);

  const load = async () => {
    setLoading(true);

    // 1. Load local URLs first (sync/instant)
    try {
      const stored = localStorage.getItem('navi_invite_urls');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setLocalInviteUrls(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load invite URLs', e);
    }

    // 2. Fetch data with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const res = await fetch('/api/cohost/users/list', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 403) {
        // User not authorized to view team (e.g. Cleaner)
        // Redirect to calendar or home
        window.location.href = '/cohost/calendar';
        return;
      }

      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

      const data = await res.json();
      setMembers(data.members || []);
      setInvites(data.invites || []);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('Load timed out');
        setMessage('Network timeout loading team data.');
      } else {
        console.error('Failed to load team data:', error);
        setMessage('Failed to load team data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);


  // Clear form helper
  const clearForm = () => {
    setForm({
      invitee_name: '',
      invitee_email: '',
      role: 'cleaner' as Role,
      can_view_calendar: true,
      can_view_guest_name: true,
      can_view_guest_count: true,
      can_view_booking_notes: false,
      can_view_contact_info: false,
    });
  };

  const sendInvite = async () => {
    setSending(true);
    setMessage(null);

    const res = await fetch('/api/cohost/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invitee_name: form.invitee_name,
        invitee_email: form.invitee_email,
        role: form.role,
        role_label: ROLE_LABELS[form.role],
        permissions: {
          can_view_calendar: form.can_view_calendar,
          can_view_guest_name: form.can_view_guest_name,
          can_view_guest_count: form.can_view_guest_count,
          can_view_booking_notes: form.can_view_booking_notes,
          can_view_contact_info: form.can_view_contact_info,
        },
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      // 1. Clear Form
      clearForm();

      // 2. Persist URL to LocalStorage (read from localStorage directly to avoid stale closure)
      let currentUrls: Record<string, string> = {};
      try {
        const raw = localStorage.getItem('navi_invite_urls');
        if (raw) currentUrls = JSON.parse(raw) || {};
      } catch { }
      const updatedLocalUrls = { ...currentUrls, [data.invite_id]: data.invite_url };
      setLocalInviteUrls(updatedLocalUrls);
      localStorage.setItem('navi_invite_urls', JSON.stringify(updatedLocalUrls));

      // 3. Reload list (localUrls will pair with new invite)
      await load();

      const emailMsg = data.delivery_status === 'email_sent'
        ? 'Email sent.'
        : 'Email failed (blocked).';

      setMessage(`Invite created! ${emailMsg} Link is below.`);
    } else {
      setMessage(data.error || 'Invite failed.');
    }
    setSending(false);
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('Invite link copied to clipboard!');
  };

  const revoke = async (type: 'member' | 'invite', id: string) => {
    await fetch('/api/cohost/users/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });

    // Clean up local storage (read from localStorage directly to avoid stale closure)
    if (type === 'invite') {
      let current: Record<string, string> = {};
      try {
        const raw = localStorage.getItem('navi_invite_urls');
        if (raw) current = JSON.parse(raw) || {};
      } catch { }
      delete current[id];
      setLocalInviteUrls(current);
      localStorage.setItem('navi_invite_urls', JSON.stringify(current));
    }

    await load();
  };

  return (
    <div className="p-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Team Members</h1>
        <p className="text-gray-500">Invite and manage co-hosts with field-level calendar visibility.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Invite User</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input className="border rounded-lg p-2" placeholder="Name"
            value={form.invitee_name}
            onChange={e => setForm({ ...form, invitee_name: e.target.value })} />
          <input className="border rounded-lg p-2" placeholder="Email"
            value={form.invitee_email}
            onChange={e => setForm({ ...form, invitee_email: e.target.value })} />
          <select
            className="border rounded-lg p-2 bg-white text-gray-700"
            value={form.role}
            onChange={e => {
              const newRole = e.target.value as Role;
              const isCleaner = newRole === 'cleaner';
              setForm({
                ...form,
                role: newRole,
                // Adjust defaults based on role
                can_view_guest_name: !isCleaner,
                can_view_guest_count: true,
                can_view_booking_notes: !isCleaner,
                can_view_contact_info: !isCleaner,
                // Calendar view always true for now, or match role config
                can_view_calendar: true,
              });
            }}
          >
            {ASSIGNABLE_ROLES.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['can_view_calendar', 'Can view calendar'],
            ['can_view_guest_name', 'Can view guest name'],
            ['can_view_guest_count', 'Can view guest count'],
            ['can_view_booking_notes', 'Can view booking notes'],
            ['can_view_contact_info', 'Can view contact info'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={(form as any)[key]}
                onChange={e => setForm({ ...form, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>

        <button
          onClick={sendInvite}
          disabled={sending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          {sending ? 'Sending...' : 'Send Invite'}
        </button>
        {message && (
          <div className={`text-sm p-3 rounded-md ${message.includes('failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {message}
          </div>
        )}
      </div>

      {/* ── Invites Section ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Invites</h2>
        {loading ? <p className="text-gray-400">Loading...</p> : invites.length === 0 ? (
          apiFailed && Object.keys(localInviteUrls).length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">⚠️ Could not load from server. Showing cached invite links:</p>
              {Object.entries(localInviteUrls).map(([invId, url]) => (
                <div key={invId} className="bg-green-50 border border-green-200 rounded p-2 flex gap-2 items-center">
                  <span className="text-xs text-green-700 font-medium">Link:</span>
                  <input readOnly value={url} className="flex-1 text-xs p-1 border rounded bg-white text-gray-600 font-mono" />
                  <button onClick={() => copyLink(url)} className="px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50 font-medium">Copy</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No invites.</p>
          )
        ) : (
          <div className="space-y-3">
            {invites.map(inv => {
              const isExpired = inv.status === 'pending' && new Date(inv.expires_at) < new Date();
              const statusLabel = isExpired ? 'Expired' : inv.status === 'accepted' ? 'Accepted' : 'Pending';
              const statusColor = isExpired ? 'bg-red-100 text-red-700'
                : inv.status === 'accepted' ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700';

              const linkUrl = inv.invite_url || localInviteUrls[inv.id];

              return (
                <div key={inv.id} className="flex flex-col gap-2 border-b last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {inv.invitee_email}
                        <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>{statusLabel}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {inv.role_label || inv.role || 'Member'} · {inv.status === 'accepted' ? 'Accepted' : `Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    {inv.status === 'pending' && (
                      <button onClick={() => revoke('invite', inv.id)} className="text-sm text-red-600 hover:text-red-800">Revoke</button>
                    )}
                    {inv.status === 'accepted' && (
                      <button onClick={() => revoke('invite', inv.id)} className="text-sm text-red-600 hover:text-red-800">Remove</button>
                    )}
                  </div>

                  {/* Show invite link for pending invites only */}
                  {inv.status === 'pending' && linkUrl && (
                    <div className="bg-green-50 border border-green-200 rounded p-2 flex gap-2 items-center">
                      <span className="text-xs text-green-700 font-medium">Link:</span>
                      <input readOnly value={linkUrl} className="flex-1 text-xs p-1 border rounded bg-white text-gray-600 font-mono" />
                      <button onClick={() => copyLink(linkUrl)} className="px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50 font-medium">Copy</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Active Members Section ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Active Members</h2>
        {loading ? <p className="text-gray-400">Loading...</p> : (() => {
          const active = members.filter(m => m.is_active);
          const inactive = members.filter(m => !m.is_active);
          return active.length === 0 && inactive.length === 0 ? (
            <p className="text-gray-400">No members found.</p>
          ) : (
            <div className="space-y-4">
              {active.length > 0 && (
                <div className="space-y-3">
                  {active.map(m => (
                    <div key={m.id || m.user_id} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {m.email || m.user_id}
                          {m.role === 'owner' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Owner</span>}
                        </div>
                        <div className="text-xs text-gray-500">{m.role_label || m.role}</div>
                      </div>
                      {m.role !== 'owner' && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setManagingUser({ id: m.user_id, name: m.email || 'User' })}
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
                            title="Manage Properties"
                          >
                            <Key className="w-3.5 h-3.5" />
                            <span className="font-medium">Properties</span>
                          </button>
                          <button onClick={() => revoke('member', m.id)} className="text-sm text-red-600 hover:text-red-800">Deactivate</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Former Members (Deactivated) */}
              {inactive.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Former Members</h3>
                  <div className="space-y-2">
                    {inactive.map(m => (
                      <div key={m.id || m.user_id} className="flex items-center justify-between opacity-60">
                        <div>
                          <div className="font-medium">{m.email || m.user_id}</div>
                          <div className="text-xs text-gray-400">{m.role_label || m.role} · Deactivated</div>
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
      {managingUser && (
        <ManagePropertiesModal
          userId={managingUser.id}
          userName={managingUser.name}
          onClose={() => setManagingUser(null)}
        />
      )}
    </div>
  );
}
