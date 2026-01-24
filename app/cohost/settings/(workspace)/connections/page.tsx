'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Property = {
    id: string;
    name: string;
    image_url?: string;
};

type Connection = {
    id: string;
    platform: 'airbnb' | 'vrbo' | 'booking' | 'pms';
    name?: string;
    display_email: string;
    reservation_label?: string;
    message_label?: string;
    notes: string;
    created_at: string;
    mapped_properties_count?: number;
    mapped_property_ids?: string[];
    gmail_connected_at?: string | null;
    gmail_status?: 'connected' | 'error' | 'pending' | null;
    gmail_last_error_code?: string | null;
    gmail_last_error_message?: string | null;
    gmail_last_verified_at?: string | null;
    last_synced_at?: string | null; // Derived from gmail_last_verified_at
    last_enrichment?: {
        created_at: string;
        status: string;
        emails_processed: number;
    } | null;
};

export default function ConnectionsSettingsPage() {
    const supabase = createClient();

    // State
    const [loading, setLoading] = useState(true);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);

    // Action State
    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
    const [actionLoading, setActionLoading] = useState(false);
    const [gmailLabels, setGmailLabels] = useState<{ id: string; name: string }[]>([]);
    const [selectedLabel, setSelectedLabel] = useState<string>('');

    const handleSync = async (connectionId: string) => {
        setSyncingIds(prev => {
            const next = new Set(prev);
            next.add(connectionId);
            return next;
        });

        try {
            const res = await fetch(`/api/cohost/connections/${connectionId}/sync`, {
                method: 'POST'
            });
            const data = await res.json();

            if (res.ok && data.success) {
                alert(data.message);
                fetchData();
            } else {
                alert(`Sync failed: ${data.error}`);
            }
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setSyncingIds(prev => {
                const next = new Set(prev);
                next.delete(connectionId);
                return next;
            });
        }
    };

    const handleConnectGmail = (connectionId: string) => {
        // Redirect to the new start route
        window.location.href = `/api/cohost/connections/${connectionId}/gmail/start`;
    };

    const fetchGmailLabels = async (connectionId: string) => {
        try {
            const res = await fetch(`/api/cohost/connections/${connectionId}/gmail/labels`);
            if (res.ok) {
                const data = await res.json();
                setGmailLabels(data.labels || []);
            }
        } catch (err) {
            console.error('Failed to fetch labels:', err);
        }
    };

    const handleSaveLabel = async (connectionId: string) => {
        if (!selectedLabel) {
            alert('Please select a label');
            return;
        }

        setActionLoading(true);
        try {
            const res = await fetch(`/api/cohost/connections/${connectionId}/gmail/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label_name: selectedLabel })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                alert(`✅ Label saved and verified!`);
                fetchData(); // Refresh connections
                setGmailLabels([]);
                setSelectedLabel('');
            } else {
                alert(`❌ Failed: ${data.error}`);
            }
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<{
        platform: 'airbnb' | 'vrbo' | 'booking' | 'pms';
        name: string;
        display_email: string;
        notes: string;
        reservation_label: string;
        selected_property_ids: string[];
    }>({
        platform: 'airbnb',
        name: '',
        display_email: '',
        notes: '',
        reservation_label: '',
        selected_property_ids: []
    });

    // Fetch Initial Data
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Connections
            const { data: cxData, error: cxError } = await supabase
                .from('connections')
                .select('*')
                .order('created_at', { ascending: false });

            if (cxError) throw cxError;

            // 2. Fetch Mappings
            const { data: mapData, error: mapError } = await supabase
                .from('connection_properties')
                .select('connection_id, property_id');

            if (mapError) throw mapError;

            // 3. Fetch Properties
            const { data: propData, error: propError } = await supabase
                .from('cohost_properties')
                .select('id, name, image_url')
                .order('name');

            if (propError) throw propError;
            setProperties(propData || []);

            // 4. Fetch Last Logs (Separate query for simplicity)
            // Ideally use a lateral join or separate aggregated view
            const { data: logData, error: logError } = await supabase
                .from('enrichment_logs')
                .select('connection_id, created_at, status, emails_processed')
                .order('created_at', { ascending: false });

            // 5. Merge Data
            const mergedConnections = (cxData || []).map(cx => {
                const mappings = (mapData || []).filter(m => m.connection_id === cx.id);
                // Find latest log for this connection
                const lastLog = logData?.find(l => l.connection_id === cx.id) || null;

                return {
                    ...cx,
                    mapped_properties_count: mappings.length,
                    mapped_property_ids: mappings.map(m => m.property_id),
                    last_enrichment: lastLog,
                    last_synced_at: cx.gmail_last_verified_at || lastLog?.created_at || null
                };
            });

            setConnections(mergedConnections);

        } catch (error: any) {
            console.error('Error fetching connections:', error);
            // Don't alert on log fetch fail, just degrade gracefully
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (cx?: Connection) => {
        if (cx) {
            setEditingId(cx.id);
            setFormData({
                platform: cx.platform,
                name: cx.name || '',
                display_email: cx.display_email || '',
                notes: cx.notes || '',
                reservation_label: cx.reservation_label || '',
                selected_property_ids: cx.mapped_property_ids || []
            });
        } else {
            setEditingId(null);
            setFormData({
                platform: 'airbnb',
                name: '',
                display_email: '',
                notes: '',
                reservation_label: '',
                selected_property_ids: []
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.display_email) {
            alert('Please enter an email or username.');
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            let connectionId = editingId;

            if (editingId) {
                // UPDATE
                const { error } = await supabase
                    .from('connections')
                    .update({
                        platform: formData.platform,
                        name: formData.name,
                        display_email: formData.display_email,
                        notes: formData.notes,
                        reservation_label: formData.reservation_label || null
                    })
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                // INSERT
                const { data, error } = await supabase
                    .from('connections')
                    .insert({
                        user_id: user.id,
                        platform: formData.platform,
                        name: formData.name,
                        display_email: formData.display_email,
                        notes: formData.notes,
                        reservation_label: formData.reservation_label || null
                    })
                    .select()
                    .single();
                if (error) throw error;
                connectionId = data.id;
            }

            // UPDATE MAPPINGS
            if (connectionId) {
                await supabase
                    .from('connection_properties')
                    .delete()
                    .eq('connection_id', connectionId);

                if (formData.selected_property_ids.length > 0) {
                    const inserts = formData.selected_property_ids.map(pid => ({
                        connection_id: connectionId,
                        property_id: pid
                    }));

                    const { error: mapError } = await supabase
                        .from('connection_properties')
                        .insert(inserts);

                    if (mapError) throw mapError;
                }
            }

            // Refresh UI
            await fetchData();
            setIsModalOpen(false);

        } catch (error: any) {
            console.error('Error saving connection:', error);
            alert('Failed to save connection: ' + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this connection?')) return;
        try {
            const { error } = await supabase
                .from('connections')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchData();
        } catch (error: any) {
            alert('Failed to delete: ' + error.message);
        }
    };

    const togglePropertySelection = (pid: string) => {
        const current = formData.selected_property_ids;
        if (current.includes(pid)) {
            setFormData({ ...formData, selected_property_ids: current.filter(id => id !== pid) });
        } else {
            setFormData({ ...formData, selected_property_ids: [...current, pid] });
        }
    };

    const getPlatformStyle = (platform: string) => {
        switch (platform) {
            case 'airbnb': return 'bg-rose-50 text-rose-600';
            case 'vrbo': return 'bg-blue-50 text-blue-600';
            case 'booking': return 'bg-indigo-50 text-indigo-600';
            case 'pms': return 'bg-gray-100 text-gray-700';
            default: return 'bg-gray-50 text-gray-600';
        }
    };

    const getPlatformLabel = (platform: string) => {
        switch (platform) {
            case 'pms': return 'PMS Integration';
            case 'booking': return 'Booking.com';
            default: return platform.charAt(0).toUpperCase() + platform.slice(1);
        }
    };

    return (
        <>
            <div className="max-w-4xl mx-auto space-y-6">
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Platform Connections</h1>
                        <p className="text-gray-500 mt-1">Manage credentials and link them to your properties.</p>
                    </div>
                    <button
                        onClick={() => handleOpenModal()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Connection
                    </button>
                </header>

                {loading ? (
                    <div className="p-12 text-center text-gray-400">Loading...</div>
                ) : connections.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
                        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">No connections yet</h3>
                        <p className="text-gray-500 mt-1 max-w-sm mx-auto">
                            Add your Airbnb, VRBO, or other accounts to link them with your properties.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {connections.map(cx => (
                            <div key={cx.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between hover:border-blue-200 transition-colors">
                                <div className="flex items-start gap-4 basis-full sm:basis-auto mb-4 sm:mb-0">
                                    <div className={`p-3 rounded-lg ${getPlatformStyle(cx.platform)}`}>
                                        <span className="font-bold text-lg capitalize">{cx.platform === 'pms' ? 'PMS' : cx.platform[0]}</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-gray-900">
                                                {cx.name || getPlatformLabel(cx.platform)}
                                            </h3>
                                            {cx.name && (
                                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {getPlatformLabel(cx.platform)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-gray-600 font-mono text-sm">{cx.display_email}</p>
                                    </div>
                                </div>

                                {/* Right: Status & Actions */}
                                <div className="flex items-center gap-6 pl-4 border-l border-gray-100 basis-full sm:basis-auto justify-end sm:justify-start mt-4 sm:mt-0">

                                    <div className="flex flex-col items-end min-w-[100px]">
                                        {/* Status Chip */}
                                        {cx.gmail_status === 'connected' ? (
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-50 rounded-full border border-green-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                <span className="text-xs font-medium text-green-700">Connected</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 rounded-full border border-red-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                <span className="text-xs font-medium text-red-700">
                                                    {cx.gmail_status === 'error' ? 'Disconnected' : 'Not Linked'}
                                                </span>
                                            </div>
                                        )}

                                        {/* Last Synced Text */}
                                        {cx.last_synced_at && cx.gmail_status === 'connected' && (
                                            <span className="text-[10px] text-gray-400 mt-1">
                                                Synced {new Date(cx.last_synced_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 items-center">
                                        {cx.gmail_status !== 'connected' ? (
                                            <button
                                                onClick={() => handleConnectGmail(cx.id)}
                                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 shadow-sm transition-colors whitespace-nowrap"
                                            >
                                                {cx.gmail_status === 'error' ? 'Reconnect' : 'Connect'}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleSync(cx.id)}
                                                disabled={syncingIds.has(cx.id)}
                                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
                                            >
                                                <svg className={`w-3.5 h-3.5 text-gray-400 ${syncingIds.has(cx.id) ? 'animate-spin text-blue-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                {syncingIds.has(cx.id) ? 'Syncing...' : 'Sync Now'}
                                            </button>
                                        )}

                                        <div className="h-4 w-px bg-gray-200 mx-1"></div>

                                        {/* Edit */}
                                        <button
                                            onClick={() => handleOpenModal(cx)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title="Edit Connection"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>

                                        {/* Delete */}
                                        <button
                                            onClick={() => handleDelete(cx.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Delete Connection"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {editingId ? 'Edit Connection' : 'Add New Connection'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Connection Name Field (New) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. My Primary Airbnb"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-1">A friendly nickname for this account (optional).</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                                <select
                                    value={formData.platform}
                                    onChange={e => setFormData({ ...formData, platform: e.target.value as any })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                >
                                    <option value="airbnb">Airbnb</option>
                                    <option value="vrbo">VRBO</option>
                                    <option value="booking">Booking.com</option>
                                    <option value="pms">PMS (Guesty, Hostway, etc)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Account Email / Username</label>
                                <input
                                    type="text"
                                    value={formData.display_email}
                                    onChange={e => setFormData({ ...formData, display_email: e.target.value })}
                                    placeholder="e.g. host@example.com"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    rows={2}
                                    placeholder="Optional notes"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                                />
                            </div>

                            {/* Gmail Label Field */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Gmail Label (Reservation Emails)
                                </label>
                                <div className="space-y-2">
                                    {gmailLabels.length > 0 ? (
                                        <select
                                            value={formData.reservation_label}
                                            onChange={e => setFormData({ ...formData, reservation_label: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        >
                                            <option value="">-- Select a label --</option>
                                            {gmailLabels.map(label => (
                                                <option key={label.id} value={label.name}>
                                                    {label.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={formData.reservation_label}
                                            onChange={e => setFormData({ ...formData, reservation_label: e.target.value })}
                                            placeholder="e.g. Airbnb Guests, Lodgify Guests"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        />
                                    )}
                                    {editingId && (
                                        <button
                                            type="button"
                                            onClick={() => fetchGmailLabels(editingId)}
                                            className="text-xs text-blue-600 hover:underline"
                                        >
                                            {gmailLabels.length > 0 ? 'Refresh labels' : 'Load labels from Gmail'}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    The Gmail label where reservation emails are stored. Leave empty if not using Gmail sync.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Map to Properties</label>
                                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                    {properties.length === 0 ? (
                                        <p className="p-4 text-xs text-gray-400 text-center">No properties found.</p>
                                    ) : (
                                        properties.map(p => (
                                            <label key={p.id} className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.selected_property_ids.includes(p.id)}
                                                    onChange={() => togglePropertySelection(p.id)}
                                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                />
                                                <span className="ml-3 text-sm text-gray-700">{p.name}</span>
                                            </label>
                                        ))
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Select which properties utilize this account. This helps organizing future integrations (like Gmail parsing).
                                </p>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm"
                            >
                                {editingId ? 'Save Changes' : 'Create Connection'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
