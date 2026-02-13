'use client';

import React, { useEffect, useState } from 'react';

export default function TeamSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    invitee_name: '',
    invitee_email: '',
    role_label: '',
    can_view_calendar: true,
    can_view_guest_name: true,
    can_view_guest_count: true,
    can_view_booking_notes: false,
    can_view_contact_info: false,
  });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/cohost/users/list');
    const data = await res.json();
    setMembers(data.members || []);
    setInvites(data.invites || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendInvite = async () => {
    setSending(true);
    setMessage(null);
    const res = await fetch('/api/cohost/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invitee_name: form.invitee_name,
        invitee_email: form.invitee_email,
        role_label: form.role_label,
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
    if (res.ok) {
      setMessage(`Invite sent. ${data.invite_url ? 'Fallback link ready.' : ''}`);
      await load();
    } else {
      setMessage(data.error || 'Invite failed.');
    }
    setSending(false);
  };

  const revoke = async (type: 'member' | 'invite', id: string) => {
    await fetch('/api/cohost/users/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });
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
          <input className="border rounded-lg p-2" placeholder="Role label"
            value={form.role_label}
            onChange={e => setForm({ ...form, role_label: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['can_view_calendar','Can view calendar'],
            ['can_view_guest_name','Can view guest name'],
            ['can_view_guest_count','Can view guest count'],
            ['can_view_booking_notes','Can view booking notes'],
            ['can_view_contact_info','Can view contact info'],
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
        {message && <p className="text-sm text-gray-500">{message}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Pending Invites</h2>
        {loading ? <p className="text-gray-400">Loading...</p> : invites.length === 0 ? (
          <p className="text-gray-400">No pending invites.</p>
        ) : (
          <div className="space-y-3">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{inv.invitee_email}</div>
                  <div className="text-xs text-gray-500">{inv.role_label || 'Member'} · Expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                </div>
                <button onClick={() => revoke('invite', inv.id)} className="text-sm text-red-600">Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Members</h2>
        {loading ? <p className="text-gray-400">Loading...</p> : members.length === 0 ? (
          <p className="text-gray-400">No members found.</p>
        ) : (
          <div className="space-y-3">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{m.email || m.user_id}</div>
                  <div className="text-xs text-gray-500">{m.role_label || m.role}</div>
                </div>
                {m.is_active ? (
                  <button onClick={() => revoke('member', m.id)} className="text-sm text-red-600">Deactivate</button>
                ) : (
                  <span className="text-xs text-gray-400">Deactivated</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
