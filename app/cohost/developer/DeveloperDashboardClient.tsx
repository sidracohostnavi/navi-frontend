'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Overview {
    totalUsers: number;
    totalWorkspaces: number;
    totalProperties: number;
    activeFeeds: number;
    gmail: { connected: number; broken: number };
    invites: { total: number; used: number; active: number };
}

interface Invite {
    id: string;
    token: string;
    note: string | null;
    created_at: string;
    used_at: string | null;
    used_by_email: string | null;
    revoked: boolean;
    invite_url: string;
}

interface HostUser {
    id: string;
    email: string | undefined;
    created_at: string;
    email_confirmed: boolean;
    workspace_id: string | null;
    property_count: number;
    gmail_connected: boolean;
    gmail_status: string | null;
    gmail_last_success: string | null;
    gmail_last_error: string | null;
    gmail_broken: boolean;
    has_ical: boolean;
    ical_last_synced_at: string | null;
    days_since_signup: number;
}

interface GmailError {
    connection_id: string;
    workspace_id: string;
    workspace_name: string | null;
    owner_email: string | null;
    gmail_status: string;
    error_message: string | null;
    last_success_at: string | null;
    error_at: string | null;
}

type Tab = 'overview' | 'invites' | 'hosts' | 'health' | 'errors';
type HostSubTab = 'active' | 'inactive' | 'issues';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

function StatusBadge({ label, color }: { label: string; color: 'green' | 'red' | 'yellow' | 'gray' | 'blue' }) {
    const colors = {
        green: 'bg-green-100 text-green-700',
        red: 'bg-red-100 text-red-700',
        yellow: 'bg-yellow-100 text-yellow-800',
        gray: 'bg-gray-100 text-gray-600',
        blue: 'bg-blue-100 text-blue-700',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
            {label}
        </span>
    );
}

function StatCard({ label, value, sub, alert }: { label: string; value: number | string; sub?: string; alert?: boolean }) {
    return (
        <div className={`bg-white rounded-xl border p-5 ${alert ? 'border-red-200' : 'border-gray-200'}`}>
            <p className="text-sm text-gray-500 mb-1">{label}</p>
            <p className={`text-3xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeveloperDashboardClient({ adminEmail }: { adminEmail: string }) {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [hostSubTab, setHostSubTab] = useState<HostSubTab>('active');
    const [overview, setOverview] = useState<Overview | null>(null);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [users, setUsers] = useState<HostUser[]>([]);
    const [gmailErrors, setGmailErrors] = useState<GmailError[]>([]);
    const [loading, setLoading] = useState(true);
    const [newNote, setNewNote] = useState('');
    const [creating, setCreating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [resending, setResending] = useState<string | null>(null);
    const [resendEmail, setResendEmail] = useState<Record<string, string>>({});
    const [resendResult, setResendResult] = useState<Record<string, 'ok' | 'err'>>({});
    const [latestInviteId, setLatestInviteId] = useState<string | null>(null);
    const [needsAttentionDays, setNeedsAttentionDays] = useState(3);
    const [showNeedsAttentionOnly, setShowNeedsAttentionOnly] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [overviewRes, invitesRes, usersRes, errorsRes] = await Promise.all([
                fetch('/api/cohost/admin/overview'),
                fetch('/api/cohost/admin/invites'),
                fetch('/api/cohost/admin/users'),
                fetch('/api/cohost/admin/errors'),
            ]);
            if (overviewRes.ok) setOverview(await overviewRes.json());
            if (invitesRes.ok) setInvites((await invitesRes.json()).invites || []);
            if (usersRes.ok) setUsers((await usersRes.json()).users || []);
            if (errorsRes.ok) setGmailErrors((await errorsRes.json()).errors || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const createInvite = async () => {
        setCreating(true);
        try {
            const res = await fetch('/api/cohost/admin/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: newNote.trim() || null }),
            });
            if (!res.ok) return;
            const { invite } = await res.json();
            setInvites(prev => [invite, ...prev]);
            setLatestInviteId(invite.id);
            setNewNote('');
            await copyToClipboard(invite.invite_url, invite.id);
            const overviewRes = await fetch('/api/cohost/admin/overview');
            if (overviewRes.ok) setOverview(await overviewRes.json());
            setActiveTab('invites');
        } finally {
            setCreating(false);
        }
    };

    const revokeInvite = async (id: string) => {
        setRevoking(id);
        try {
            const res = await fetch('/api/cohost/admin/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (res.ok) {
                setInvites(prev => prev.map(inv => inv.id === id ? { ...inv, revoked: true } : inv));
                const overviewRes = await fetch('/api/cohost/admin/overview');
                if (overviewRes.ok) setOverview(await overviewRes.json());
            }
        } finally {
            setRevoking(null);
        }
    };

    const resendInviteEmail = async (inv: Invite) => {
        const email = resendEmail[inv.id]?.trim();
        if (!email) return;
        setResending(inv.id);
        try {
            const res = await fetch('/api/cohost/admin/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: inv.id, action: 'resend_email', email }),
            });
            setResendResult(prev => ({ ...prev, [inv.id]: res.ok ? 'ok' : 'err' }));
            setTimeout(() => setResendResult(prev => { const n = { ...prev }; delete n[inv.id]; return n; }), 3000);
        } finally {
            setResending(null);
        }
    };

    // Categorise hosts
    const activeHosts = users.filter(u =>
        u.workspace_id && u.property_count > 0 && !u.gmail_broken
    );
    const issueHosts = users.filter(u =>
        u.gmail_broken || (u.workspace_id && u.property_count > 0 && !u.gmail_connected && !u.has_ical)
    );
    const inactiveHosts = users.filter(u =>
        !u.workspace_id || u.property_count === 0
    );

    const needsAttentionHosts = users.filter(u =>
        u.days_since_signup >= needsAttentionDays &&
        (!u.workspace_id || u.property_count === 0 || (!u.gmail_connected && !u.has_ical))
    );

    const tabs: { id: Tab; label: string }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'invites', label: 'Invites' },
        { id: 'hosts', label: 'Hosts' },
        { id: 'health', label: 'Health' },
        { id: 'errors', label: 'Errors' },
    ];

    // ── Overview Tab ──────────────────────────────────────────────────────────

    const OverviewTab = () => (
        <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                <StatCard label="Total Hosts" value={overview?.totalUsers ?? '—'} />
                <StatCard label="Workspaces" value={overview?.totalWorkspaces ?? '—'} />
                <StatCard label="Properties" value={overview?.totalProperties ?? '—'} />
                <StatCard label="Active iCal Feeds" value={overview?.activeFeeds ?? '—'} />
                <StatCard
                    label="Gmail Connections"
                    value={overview?.gmail.connected ?? '—'}
                    sub={overview?.gmail.broken ? `${overview.gmail.broken} broken` : 'All healthy'}
                    alert={(overview?.gmail.broken ?? 0) > 0}
                />
                <StatCard
                    label="Invites Created"
                    value={overview?.invites.total ?? '—'}
                    sub={`${overview?.invites.used ?? 0} used · ${overview?.invites.active ?? 0} active`}
                />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Create Invite</h3>
                <div className="flex gap-3 items-center">
                    <input
                        type="text"
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        placeholder="Note (e.g. John – 3 properties)"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FA5A5A] focus:ring-1 focus:ring-[#FA5A5A]"
                        onKeyDown={e => e.key === 'Enter' && !creating && createInvite()}
                    />
                    <button
                        onClick={createInvite}
                        disabled={creating}
                        className="px-4 py-2 bg-[#FA5A5A] text-white text-sm font-medium rounded-lg hover:bg-[#e04848] disabled:opacity-50 whitespace-nowrap transition-colors"
                    >
                        {creating ? 'Generating...' : 'Generate Invite'}
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">Link is auto-copied to clipboard on creation.</p>
            </div>
        </div>
    );

    // ── Invites Tab ───────────────────────────────────────────────────────────

    const InvitesTab = () => (
        <div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">New Invite</h3>
                <div className="flex gap-3 items-center">
                    <input
                        type="text"
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        placeholder="Note (e.g. Sarah – beach house)"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FA5A5A] focus:ring-1 focus:ring-[#FA5A5A]"
                        onKeyDown={e => e.key === 'Enter' && !creating && createInvite()}
                    />
                    <button
                        onClick={createInvite}
                        disabled={creating}
                        className="px-5 py-2 bg-[#FA5A5A] text-white text-sm font-semibold rounded-lg hover:bg-[#e04848] disabled:opacity-50 whitespace-nowrap transition-colors"
                    >
                        {creating ? 'Creating...' : '+ Create Invite'}
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">Link is auto-copied to clipboard on creation.</p>
            </div>

            {invites.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No invites yet.</div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invite Link</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Used By</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resend</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invites.map(inv => {
                                const isNew = inv.id === latestInviteId;
                                const status = inv.used_at ? 'used' : inv.revoked ? 'revoked' : 'active';
                                return (
                                    <tr
                                        key={inv.id}
                                        className={`border-b border-gray-100 last:border-0 transition-colors ${isNew ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs text-gray-500 truncate max-w-[180px]" title={inv.invite_url}>
                                                    {inv.invite_url}
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(inv.invite_url, inv.id)}
                                                    className="shrink-0 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                                                    title="Copy invite link"
                                                >
                                                    {copiedId === inv.id ? '✓ Copied' : 'Copy'}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{inv.note || <span className="text-gray-300">—</span>}</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(inv.created_at)}</td>
                                        <td className="px-4 py-3">
                                            {status === 'used' && <StatusBadge label="Used" color="green" />}
                                            {status === 'revoked' && <StatusBadge label="Revoked" color="gray" />}
                                            {status === 'active' && <StatusBadge label="Active" color="blue" />}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {inv.used_by_email || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            {status === 'active' && (
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="email"
                                                        value={resendEmail[inv.id] || ''}
                                                        onChange={e => setResendEmail(prev => ({ ...prev, [inv.id]: e.target.value }))}
                                                        placeholder="email@host.com"
                                                        className="w-36 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-[#FA5A5A]"
                                                    />
                                                    <button
                                                        onClick={() => resendInviteEmail(inv)}
                                                        disabled={resending === inv.id || !resendEmail[inv.id]?.trim()}
                                                        className="px-2 py-1 text-xs bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-40 whitespace-nowrap transition-colors"
                                                    >
                                                        {resending === inv.id ? '...' : resendResult[inv.id] === 'ok' ? '✓ Sent' : resendResult[inv.id] === 'err' ? '✗ Failed' : 'Send'}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {status === 'active' && (
                                                <button
                                                    onClick={() => revokeInvite(inv.id)}
                                                    disabled={revoking === inv.id}
                                                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                                                >
                                                    {revoking === inv.id ? 'Revoking...' : 'Revoke'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    // ── Hosts Tab ─────────────────────────────────────────────────────────────

    const HostsTab = () => {
        const subTabs: { id: HostSubTab; label: string; count: number; color: string }[] = [
            { id: 'active', label: 'Active', count: activeHosts.length, color: 'green' },
            { id: 'issues', label: 'Issues', count: issueHosts.length, color: 'red' },
            { id: 'inactive', label: 'Inactive', count: inactiveHosts.length, color: 'gray' },
        ];

        const displayUsers = hostSubTab === 'active' ? activeHosts
            : hostSubTab === 'issues' ? issueHosts
            : inactiveHosts;

        const filteredUsers = showNeedsAttentionOnly
            ? displayUsers.filter(u => needsAttentionHosts.includes(u))
            : displayUsers;

        return (
            <div>
                {/* Sub-tabs */}
                <div className="flex gap-2 mb-4">
                    {subTabs.map(st => (
                        <button
                            key={st.id}
                            onClick={() => setHostSubTab(st.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                hostSubTab === st.id
                                    ? st.id === 'issues'
                                        ? 'bg-red-50 border-red-300 text-red-700'
                                        : st.id === 'active'
                                        ? 'bg-green-50 border-green-300 text-green-700'
                                        : 'bg-gray-100 border-gray-300 text-gray-700'
                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            {st.label}
                            <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                                hostSubTab === st.id
                                    ? st.id === 'issues' ? 'bg-red-100 text-red-600' : st.id === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                                    : 'bg-gray-100 text-gray-500'
                            }`}>
                                {st.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Needs-attention filter */}
                <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showNeedsAttentionOnly}
                            onChange={e => setShowNeedsAttentionOnly(e.target.checked)}
                            className="rounded border-gray-300 text-[#FA5A5A] focus:ring-[#FA5A5A]"
                        />
                        Show only hosts who haven't set up after
                        <input
                            type="number"
                            min={1}
                            max={30}
                            value={needsAttentionDays}
                            onChange={e => setNeedsAttentionDays(Number(e.target.value))}
                            className="w-12 px-1.5 py-0.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:border-[#FA5A5A]"
                        />
                        days
                    </label>
                    {showNeedsAttentionOnly && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                            {filteredUsers.length} need attention
                        </span>
                    )}
                </div>

                {/* Issue description */}
                {hostSubTab === 'issues' && issueHosts.length > 0 && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                        <strong>{issueHosts.length}</strong> host{issueHosts.length > 1 ? 's' : ''} with broken Gmail or missing connections on active properties.
                    </div>
                )}
                {hostSubTab === 'inactive' && inactiveHosts.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                        <strong>{inactiveHosts.length}</strong> host{inactiveHosts.length > 1 ? 's' : ''} with no workspace or no properties set up yet.
                    </div>
                )}

                {filteredUsers.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                        {showNeedsAttentionOnly ? 'No hosts matching this filter.' : `No ${hostSubTab} hosts.`}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Properties</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gmail</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">iCal</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map(u => {
                                    const isSetup = u.workspace_id && u.property_count > 0;
                                    const needsHelp = !u.workspace_id || u.property_count === 0;
                                    const needsAttention = needsAttentionHosts.includes(u);
                                    return (
                                        <tr key={u.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${needsAttention && !showNeedsAttentionOnly ? 'bg-yellow-50/40' : ''}`}>
                                            <td className="px-4 py-3 font-medium text-gray-800">
                                                {u.email || '—'}
                                                {needsAttention && !showNeedsAttentionOnly && (
                                                    <span className="ml-2 text-xs text-yellow-600" title="Needs attention">●</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                                {formatDate(u.created_at)}
                                                <span className="ml-1 text-gray-400">({u.days_since_signup}d)</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {u.property_count > 0
                                                    ? <span className="font-semibold text-gray-800">{u.property_count}</span>
                                                    : <span className="text-gray-300">0</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                {u.gmail_connected
                                                    ? u.gmail_broken
                                                        ? <StatusBadge label="Broken" color="red" />
                                                        : <StatusBadge label="Connected" color="green" />
                                                    : <StatusBadge label="None" color="gray" />}
                                            </td>
                                            <td className="px-4 py-3">
                                                {u.has_ical
                                                    ? <StatusBadge label="Active" color="green" />
                                                    : <StatusBadge label="None" color="gray" />}
                                            </td>
                                            <td className="px-4 py-3">
                                                {u.gmail_broken
                                                    ? <StatusBadge label="Gmail Broken" color="red" />
                                                    : needsHelp
                                                    ? <StatusBadge label="Needs Setup" color="yellow" />
                                                    : isSetup
                                                    ? <StatusBadge label="Active" color="green" />
                                                    : <StatusBadge label="Incomplete" color="yellow" />}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    // ── Health Tab ────────────────────────────────────────────────────────────

    const HealthTab = () => {
        const broken = users.filter(u => u.gmail_broken);
        const noConnections = users.filter(u => u.workspace_id && !u.gmail_connected && !u.has_ical && u.property_count > 0);

        return (
            <div className="space-y-6">
                {broken.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-red-700 mb-2">⚠ Broken Gmail Connections ({broken.length})</h3>
                        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-red-50 border-b border-red-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Email</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Gmail Status</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Last Success</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {broken.map(u => (
                                        <tr key={u.id} className="border-b border-red-100 last:border-0">
                                            <td className="px-4 py-3 font-medium text-gray-800">{u.email}</td>
                                            <td className="px-4 py-3"><StatusBadge label={u.gmail_status || 'error'} color="red" /></td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">
                                                {u.gmail_last_success ? timeAgo(u.gmail_last_success) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-red-600 text-xs truncate max-w-[240px]" title={u.gmail_last_error || ''}>
                                                {u.gmail_last_error || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {noConnections.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-yellow-700 mb-2">Hosts With Properties But No Connections ({noConnections.length})</h3>
                        <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-yellow-50 border-b border-yellow-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-yellow-700 uppercase tracking-wide">Email</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-yellow-700 uppercase tracking-wide">Properties</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-yellow-700 uppercase tracking-wide">Joined</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {noConnections.map(u => (
                                        <tr key={u.id} className="border-b border-yellow-100 last:border-0">
                                            <td className="px-4 py-3 font-medium text-gray-800">{u.email}</td>
                                            <td className="px-4 py-3 text-gray-600">{u.property_count}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(u.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {broken.length === 0 && noConnections.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <div className="text-4xl mb-3">✓</div>
                        <p className="text-sm">No connection issues detected.</p>
                    </div>
                )}

                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">All Connections</h3>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gmail</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">iCal</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gmail Last Sync</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">iCal Last Sync</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.filter(u => u.workspace_id).map(u => (
                                    <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-800">{u.email}</td>
                                        <td className="px-4 py-3">
                                            {u.gmail_connected
                                                ? u.gmail_broken
                                                    ? <StatusBadge label="Broken" color="red" />
                                                    : <StatusBadge label="OK" color="green" />
                                                : <StatusBadge label="Not Connected" color="gray" />}
                                        </td>
                                        <td className="px-4 py-3">
                                            {u.has_ical
                                                ? <StatusBadge label="Active" color="green" />
                                                : <StatusBadge label="None" color="gray" />}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {u.gmail_last_success ? timeAgo(u.gmail_last_success) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {u.ical_last_synced_at ? timeAgo(u.ical_last_synced_at) : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {users.filter(u => u.workspace_id).length === 0 && (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">No hosts with workspaces yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // ── Errors Tab ────────────────────────────────────────────────────────────

    const ErrorsTab = () => (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                    Recent Gmail Sync Errors
                    <span className="ml-2 text-xs text-gray-400 font-normal">Last 20 across all workspaces</span>
                </h3>
                {gmailErrors.length === 0 && (
                    <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full">All clear</span>
                )}
            </div>

            {gmailErrors.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-200 text-gray-400">
                    <div className="text-4xl mb-3">✓</div>
                    <p className="text-sm">No Gmail sync errors detected.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-red-50 border-b border-red-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Host</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Workspace</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Status</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Error</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Last Success</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wide">Occurred</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gmailErrors.map(err => (
                                <tr key={err.connection_id} className="border-b border-red-100 last:border-0 hover:bg-red-50/30">
                                    <td className="px-4 py-3 font-medium text-gray-800 text-xs">{err.owner_email || '—'}</td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">{err.workspace_name || '—'}</td>
                                    <td className="px-4 py-3">
                                        <StatusBadge
                                            label={err.gmail_status === 'needs_reconnect' ? 'Needs Reconnect' : 'Error'}
                                            color="red"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-red-700 text-xs max-w-[280px] truncate" title={err.error_message || ''}>
                                        {err.error_message || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">
                                        {err.last_success_at ? timeAgo(err.last_success_at) : 'Never'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                        {err.error_at ? timeAgo(err.error_at) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Developer Dashboard</h1>
                        <p className="text-sm text-gray-400 mt-0.5">Signed in as <span className="font-medium">{adminEmail}</span></p>
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                    >
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 mb-6 w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? tab.id === 'errors'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-[#FA5A5A] text-white'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {tab.label}
                            {tab.id === 'invites' && invites.length > 0 && (
                                <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${activeTab === 'invites' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                    {invites.length}
                                </span>
                            )}
                            {tab.id === 'hosts' && users.length > 0 && (
                                <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${activeTab === 'hosts' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                    {users.length}
                                </span>
                            )}
                            {tab.id === 'errors' && gmailErrors.length > 0 && (
                                <span className="ml-1.5 text-xs rounded-full px-1.5 py-0.5 bg-white/20">
                                    {gmailErrors.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading && !overview ? (
                    <div className="text-center py-20 text-gray-400">
                        <div className="animate-pulse">Loading dashboard data...</div>
                    </div>
                ) : (
                    <>
                        {activeTab === 'overview' && <OverviewTab />}
                        {activeTab === 'invites' && <InvitesTab />}
                        {activeTab === 'hosts' && <HostsTab />}
                        {activeTab === 'health' && <HealthTab />}
                        {activeTab === 'errors' && <ErrorsTab />}
                    </>
                )}

                {/* Billing placeholder */}
                {activeTab === 'overview' && (
                    <div className="mt-6 p-5 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 text-sm">
                        Subscription &amp; billing tracking — coming once Stripe subscriptions are wired up
                    </div>
                )}
            </div>
        </div>
    );
}
