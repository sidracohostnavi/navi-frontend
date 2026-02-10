'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
    gmail_status?: 'connected' | 'error' | 'pending' | 'needs_reconnect' | 'disconnected' | null;
    gmail_last_error_code?: string | null;
    gmail_last_error_message?: string | null;
    gmail_last_verified_at?: string | null;
    last_synced_at?: string | null;
    color?: string | null;
    last_enrichment?: {
        created_at: string;
        status: string;
        emails_processed: number;
    } | null;
};

function ConnectionsSettingsPageInner() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const router = useRouter();

    // State
    const [loading, setLoading] = useState(true);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    // Track connection to auto-open after OAuth redirect
    const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(null);

    // Action State
    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
    const [actionLoading, setActionLoading] = useState(false);
    const [gmailLabels, setGmailLabels] = useState<{ id: string; name: string }[]>([]);
    const [selectedLabel, setSelectedLabel] = useState<string>('');
    const [labelsLoading, setLabelsLoading] = useState(false);
    const [labelsError, setLabelsError] = useState<string | null>(null);
    const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());

    // Toast notification state
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string; details?: string } | null>(null);

    // Auto-dismiss toast after 6 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

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
                const stats = data.stats || {};
                const emailsProcessed = stats.emails_scanned || 0;
                const bookingsEnriched = stats.bookings_enriched || 0;
                const reviewItems = stats.review_items_created || 0;

                // Show detailed sync results
                if (emailsProcessed === 0 && bookingsEnriched === 0) {
                    setToast({
                        type: 'info',
                        message: 'Sync complete - no new emails',
                        details: 'All emails are already processed. No updates needed.'
                    });
                } else {
                    setToast({
                        type: 'success',
                        message: `Sync complete: ${emailsProcessed} emails processed`,
                        details: `${bookingsEnriched} bookings enriched${reviewItems > 0 ? `, ${reviewItems} review items created` : ''}`
                    });
                }
                fetchData();
            } else {
                // Check for specific error types
                const errorCode = data.code || '';
                const isRateLimit = errorCode === 'RATE_LIMITED' || data.error?.includes('rate') || data.error?.includes('quota');
                const isNeedsReconnect = errorCode === 'NEEDS_RECONNECT' || data.error?.includes('token') || data.error?.includes('expired');

                if (isRateLimit) {
                    setToast({
                        type: 'warning',
                        message: '⚠️ Rate limit reached',
                        details: 'Gmail API quota exceeded. Please wait a few minutes and try again.'
                    });
                } else if (isNeedsReconnect) {
                    setToast({
                        type: 'error',
                        message: '🔄 Gmail reconnection required',
                        details: 'Your Gmail access has expired. Click Reconnect to restore sync.'
                    });
                    // Update local state to show needs_reconnect
                    setConnections(prev => prev.map(c =>
                        c.id === connectionId
                            ? { ...c, gmail_status: 'needs_reconnect' as const }
                            : c
                    ));
                } else {
                    setToast({
                        type: 'error',
                        message: 'Sync failed',
                        details: data.error || data.message || 'Unknown error'
                    });
                }
            }
        } catch (err: any) {
            setToast({
                type: 'error',
                message: 'Sync error',
                details: err.message || 'Network error occurred'
            });
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
        setLabelsLoading(true);
        setLabelsError(null);
        try {
            const res = await fetch(`/api/cohost/connections/${connectionId}/gmail/labels`);
            const data = await res.json();

            if (res.ok) {
                setGmailLabels(data.labels || []);
            } else if (data.needsReconnect || data.code === 'NEEDS_RECONNECT') {
                setLabelsError('Gmail access expired. Please reconnect.');
                // Refresh to show updated status
                fetchData();
            } else {
                setLabelsError(data.error || 'Failed to load labels');
            }
        } catch (err: any) {
            console.error('Failed to fetch labels:', err);
            setLabelsError('Failed to load labels: ' + err.message);
        } finally {
            setLabelsLoading(false);
        }
    };

    const handleSaveLabel = async (connectionId: string) => {
        if (!selectedLabel) {
            alert('Please select a label');
            return;
        }

        setActionLoading(true);
        try {
            // Find the selected label object to get both id and name
            const labelObj = gmailLabels.find(l => l.name === selectedLabel);
            if (!labelObj) {
                alert('Label not found');
                return;
            }

            const res = await fetch(`/api/cohost/connections/${connectionId}/gmail/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label_id: labelObj.id, label_name: labelObj.name })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                // Update local form state so modal reflects the change immediately
                setFormData(prev => ({ ...prev, reservation_label: labelObj.name }));
                alert(`✅ Label "${labelObj.name}" saved successfully!`);
                fetchData(); // Refresh connections list
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

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
    const [formData, setFormData] = useState<{
        platform: 'airbnb' | 'vrbo' | 'booking' | 'pms';
        name: string;
        display_email: string;
        notes: string;
        reservation_label: string;
        selected_property_ids: string[];
        color: string;
    }>({
        platform: 'airbnb',
        name: '',
        display_email: '',
        notes: '',
        reservation_label: '',
        selected_property_ids: [],
        color: ''
    });

    // Fetch Initial Data
    useEffect(() => {
        fetchData();
    }, []);

    // Handle OAuth redirect - auto-open edit modal for label selection
    useEffect(() => {
        const result = searchParams.get('result');
        const connectionId = searchParams.get('connection_id');

        if (result === 'success' && connectionId) {
            setPendingConnectionId(connectionId);
            // Clean up URL params
            router.replace('/cohost/settings/connections', { scroll: false });
        }
    }, [searchParams, router]);

    // Auto-open modal when pendingConnectionId is set and connections are loaded
    useEffect(() => {
        if (pendingConnectionId && !loading && connections.length > 0) {
            const connection = connections.find(c => c.id === pendingConnectionId);
            if (connection) {
                handleOpenModal(connection);
                // Auto-load labels since Gmail was just connected
                fetchGmailLabels(pendingConnectionId);
            }
            setPendingConnectionId(null);
        }
    }, [pendingConnectionId, loading, connections]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Connections (exclude archived)
            const { data: cxData, error: cxError } = await supabase
                .from('connections')
                .select('*')
                .is('archived_at', null)  // Exclude soft-deleted connections
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

            // Proactively verify all 'connected' connections
            healthCheckConnections(mergedConnections);

        } catch (error: any) {
            console.error('Error fetching connections:', error);
            // Don't alert on log fetch fail, just degrade gracefully
        } finally {
            setLoading(false);
        }
    };

    // Health check: verify each 'connected' connection actually works
    const healthCheckConnections = async (connectionsToCheck: Connection[]) => {
        const connectedConnections = connectionsToCheck.filter(
            cx => cx.gmail_status === 'connected'
        );

        if (connectedConnections.length === 0) return;

        // Mark all as verifying
        setVerifyingIds(new Set(connectedConnections.map(cx => cx.id)));

        // Check each connection in parallel (but update UI as each completes)
        for (const cx of connectedConnections) {
            try {
                const res = await fetch(`/api/cohost/connections/${cx.id}/gmail/labels`);
                const data = await res.json();

                // If connection needs reconnect, update local state immediately
                if (!res.ok && (data.needsReconnect || data.code === 'NEEDS_RECONNECT')) {
                    setConnections(prev => prev.map(c =>
                        c.id === cx.id
                            ? { ...c, gmail_status: 'needs_reconnect' as const }
                            : c
                    ));
                }
            } catch (err) {
                console.error(`[HealthCheck] Failed for ${cx.name}:`, err);
            } finally {
                // Remove from verifying set
                setVerifyingIds(prev => {
                    const next = new Set(prev);
                    next.delete(cx.id);
                    return next;
                });
            }
        }
    };

    const handleOpenModal = (cx?: Connection) => {
        // Clear previous label state
        setGmailLabels([]);
        setSelectedLabel('');
        setLabelsError(null);

        if (cx) {
            setEditingId(cx.id);
            setEditingConnection(cx);
            setFormData({
                platform: cx.platform,
                name: cx.name || '',
                display_email: cx.display_email || '',
                notes: cx.notes || '',
                reservation_label: cx.reservation_label || '',
                selected_property_ids: cx.mapped_property_ids || [],
                color: cx.color || ''
            });
            // Auto-fetch Gmail labels if connection has Gmail connected
            if (cx.gmail_status === 'connected') {
                fetchGmailLabels(cx.id);
            }
        } else {
            setEditingId(null);
            setEditingConnection(null);
            setFormData({
                platform: 'airbnb',
                name: '',
                display_email: '',
                notes: '',
                reservation_label: '',
                selected_property_ids: [],
                color: ''
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
                // UPDATE - Note: reservation_label/gmail_label_* are managed via Save Label flow
                const { error } = await supabase
                    .from('connections')
                    .update({
                        platform: formData.platform,
                        name: formData.name,
                        display_email: formData.display_email,
                        notes: formData.notes,
                        color: formData.color || null
                        // DO NOT include reservation_label here - it's managed via handleSaveLabel
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
                        reservation_label: formData.reservation_label || null,
                        color: formData.color || null
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
        if (!confirm('Archive this connection? Your synced emails and data will be preserved.')) return;
        try {
            // Soft-delete: set archived_at, clear tokens, mark disconnected
            const { error } = await supabase
                .from('connections')
                .update({
                    archived_at: new Date().toISOString(),
                    gmail_status: 'disconnected',
                    gmail_access_token: null,
                    gmail_refresh_token: null
                })
                .eq('id', id);

            if (error) throw error;
            fetchData();
        } catch (error: any) {
            alert('Failed to archive: ' + error.message);
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
            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 max-w-md">
                    <div className={`rounded-lg shadow-lg border px-4 py-3 flex items-start gap-3 ${toast.type === 'success' ? 'bg-green-50 border-green-200' :
                        toast.type === 'error' ? 'bg-red-50 border-red-200' :
                            toast.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                                'bg-blue-50 border-blue-200'
                        }`}>
                        <div className={`flex-shrink-0 text-lg ${toast.type === 'success' ? 'text-green-600' :
                            toast.type === 'error' ? 'text-red-600' :
                                toast.type === 'warning' ? 'text-amber-600' :
                                    'text-blue-600'
                            }`}>
                            {toast.type === 'success' ? '✓' :
                                toast.type === 'error' ? '✕' :
                                    toast.type === 'warning' ? '⚠' : 'ℹ'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm ${toast.type === 'success' ? 'text-green-800' :
                                toast.type === 'error' ? 'text-red-800' :
                                    toast.type === 'warning' ? 'text-amber-800' :
                                        'text-blue-800'
                                }`}>
                                {toast.message}
                            </p>
                            {toast.details && (
                                <p className={`mt-0.5 text-xs ${toast.type === 'success' ? 'text-green-600' :
                                    toast.type === 'error' ? 'text-red-600' :
                                        toast.type === 'warning' ? 'text-amber-600' :
                                            'text-blue-600'
                                    }`}>
                                    {toast.details}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => setToast(null)}
                            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

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
                                    {/* Color swatch */}
                                    <div
                                        className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0 mt-3"
                                        style={{ backgroundColor: cx.color || '#e5e7eb' }}
                                        title={cx.color ? `Color: ${cx.color}` : 'No color set'}
                                    />
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
                                        {verifyingIds.has(cx.id) ? (
                                            // Verifying connection health
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 rounded-full border border-blue-100">
                                                <svg className="w-3 h-3 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span className="text-xs font-medium text-blue-700">Verifying...</span>
                                            </div>
                                        ) : cx.gmail_status === 'connected' && cx.reservation_label ? (
                                            // Fully configured
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-50 rounded-full border border-green-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                <span className="text-xs font-medium text-green-700">Connected</span>
                                            </div>
                                        ) : cx.gmail_status === 'connected' ? (
                                            // Connected but needs label
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50 rounded-full border border-amber-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                <span className="text-xs font-medium text-amber-700">Needs Label</span>
                                            </div>
                                        ) : cx.gmail_status === 'needs_reconnect' ? (
                                            // Needs reconnect - token expired
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-orange-50 rounded-full border border-orange-200">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span className="text-xs font-medium text-orange-700">Needs Reconnect</span>
                                            </div>
                                        ) : cx.gmail_status === 'disconnected' || cx.gmail_status === 'error' ? (
                                            // Disconnected or error
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 rounded-full border border-red-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                <span className="text-xs font-medium text-red-700">Disconnected</span>
                                            </div>
                                        ) : (
                                            // Not connected yet
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-50 rounded-full border border-gray-200">
                                                <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                                <span className="text-xs font-medium text-gray-600">Not Linked</span>
                                            </div>
                                        )}

                                        {/* Last Synced Text */}
                                        {cx.last_synced_at && cx.gmail_status === 'connected' && (
                                            <span className="text-[10px] text-gray-400 mt-1">
                                                Synced {new Date(cx.last_synced_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(cx.last_synced_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 items-center">
                                        {cx.gmail_status !== 'connected' ? (
                                            // Not connected / needs reconnect - show Connect/Reconnect button
                                            <button
                                                onClick={() => handleConnectGmail(cx.id)}
                                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 shadow-sm transition-colors whitespace-nowrap"
                                            >
                                                {cx.gmail_status === 'error' || cx.gmail_status === 'needs_reconnect' || cx.gmail_status === 'disconnected' ? 'Reconnect' : 'Connect Gmail'}
                                            </button>
                                        ) : !cx.reservation_label ? (
                                            // Connected but no label - show Configure Label button
                                            <button
                                                onClick={() => {
                                                    handleOpenModal(cx);
                                                    fetchGmailLabels(cx.id);
                                                }}
                                                className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded hover:bg-amber-600 shadow-sm transition-colors whitespace-nowrap"
                                            >
                                                ⚙️ Configure Label
                                            </button>
                                        ) : (
                                            // Fully configured - show Sync Now
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
                            {/* Connection Name Field */}
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

                            {/* Connection Color */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={formData.color || '#e5e7eb'}
                                        onChange={e => setFormData({ ...formData, color: e.target.value })}
                                        className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                                    />
                                    <input
                                        type="text"
                                        value={formData.color}
                                        onChange={e => setFormData({ ...formData, color: e.target.value })}
                                        placeholder="#FF5733"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                                    />
                                    {formData.color && (
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, color: '' })}
                                            className="text-gray-400 hover:text-gray-600 text-xs"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Visual color for this connection (shown on calendar).</p>
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

                            {/* Gmail Label Configuration - Only show for existing connections */}
                            {editingId && (
                                <div className={`p-4 rounded-lg border-2 ${editingConnection?.gmail_status !== 'connected'
                                    ? 'bg-red-50 border-red-200'
                                    : formData.reservation_label
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-amber-50 border-amber-200'
                                    }`}>
                                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                                        📧 Gmail Label Configuration
                                        {editingConnection?.gmail_status === 'connected' && formData.reservation_label && (
                                            <span className="ml-2 text-xs font-normal text-green-700">✓ Configured</span>
                                        )}
                                    </label>

                                    {/* Disconnected / Needs Reconnect State */}
                                    {editingConnection?.gmail_status && editingConnection.gmail_status !== 'connected' && (
                                        <div className="mb-4 p-3 bg-red-100 rounded-lg border border-red-200">
                                            <p className="text-sm text-red-800 font-medium mb-2">
                                                ⚠️ Gmail {editingConnection.gmail_status === 'needs_reconnect' ? 'access expired' : 'is disconnected'}
                                            </p>
                                            <p className="text-xs text-red-600 mb-3">
                                                {editingConnection.gmail_status === 'needs_reconnect'
                                                    ? 'Your Gmail access token has expired. Please reconnect to continue syncing emails.'
                                                    : 'Connect your Gmail account to sync reservation emails.'}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => handleConnectGmail(editingId)}
                                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                                {editingConnection.gmail_status === 'needs_reconnect' ? '🔄 Reconnect Gmail' : '🔗 Connect Gmail'}
                                            </button>
                                        </div>
                                    )}

                                    {/* Not Connected Yet State */}
                                    {!editingConnection?.gmail_status && (
                                        <div className="mb-4 p-3 bg-gray-100 rounded-lg border border-gray-200">
                                            <p className="text-sm text-gray-700 mb-3">
                                                Connect your Gmail to automatically sync reservation emails.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => handleConnectGmail(editingId)}
                                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                                🔗 Connect Gmail
                                            </button>
                                        </div>
                                    )}

                                    {/* Loading state */}
                                    {labelsLoading && (
                                        <div className="text-sm text-gray-600 py-2 flex items-center gap-2">
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Loading Gmail labels...
                                        </div>
                                    )}

                                    {/* Error state */}
                                    {labelsError && !labelsLoading && (
                                        <div className="text-sm text-red-600 py-2 px-3 bg-red-50 rounded-lg border border-red-200">
                                            ⚠️ {labelsError}
                                        </div>
                                    )}

                                    {/* Label dropdown when labels are loaded */}
                                    {gmailLabels.length > 0 && !labelsLoading ? (
                                        <div className="space-y-3">
                                            <p className="text-sm text-gray-700">
                                                Select the Gmail label where your reservation emails are stored:
                                            </p>
                                            <select
                                                value={selectedLabel || formData.reservation_label}
                                                onChange={e => setSelectedLabel(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                                            >
                                                <option value="">-- Select a label --</option>
                                                {gmailLabels.map(label => (
                                                    <option key={label.id} value={label.name}>
                                                        {label.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveLabel(editingId)}
                                                    disabled={actionLoading || !selectedLabel}
                                                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {actionLoading ? 'Saving...' : '✓ Save Label'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => fetchGmailLabels(editingId)}
                                                    disabled={labelsLoading}
                                                    className="px-4 py-2 text-gray-600 text-sm hover:text-blue-600 disabled:opacity-50"
                                                >
                                                    ↻ Refresh
                                                </button>
                                            </div>
                                        </div>
                                    ) : !labelsLoading && !labelsError && (
                                        <div className="space-y-2">
                                            {formData.reservation_label ? (
                                                <p className="text-sm text-green-700">
                                                    Currently using: <strong>{formData.reservation_label}</strong>
                                                </p>
                                            ) : (
                                                <p className="text-sm text-amber-700">
                                                    ⚠️ No label configured. Select a label to start syncing reservation emails.
                                                </p>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => fetchGmailLabels(editingId)}
                                                disabled={labelsLoading}
                                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {labelsLoading && (
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                )}
                                                Load Labels from Gmail
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

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

export default function ConnectionsSettingsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
            <ConnectionsSettingsPageInner />
        </Suspense>
    );
}
