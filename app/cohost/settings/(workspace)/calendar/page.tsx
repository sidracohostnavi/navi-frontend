'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// --- Types ---
type Property = {
    id: string;
    name: string;
    address: string | null;
};

type ICalFeed = {
    id: string;
    property_id: string;
    source_name: string;
    source_type: string;
    ical_url: string;
    is_active: boolean;
    last_synced_at: string | null;
    last_sync_status: 'success' | 'error' | null;
    last_error: string | null;
    // Debug fields
    last_http_status?: number;
    last_content_type?: string;
    last_final_url?: string;
    last_event_count?: number;
    last_booking_count?: number;
    last_response_snippet?: string;
};

export default function CalendarSettingsPage() {
    const supabase = createClient();

    // State
    const [properties, setProperties] = useState<Property[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [feeds, setFeeds] = useState<ICalFeed[]>([]);
    const [loadingFeeds, setLoadingFeeds] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncingFeedId, setSyncingFeedId] = useState<string | null>(null);
    const [viewingFeedId, setViewingFeedId] = useState<string | null>(null); // For modal
    const [isAdding, setIsAdding] = useState(false);

    // Form State
    const [newFeedName, setNewFeedName] = useState('');
    const [selectedFeedType, setSelectedFeedType] = useState('');
    const [newFeedUrl, setNewFeedUrl] = useState('');

    // 1. Fetch Properties on load
    useEffect(() => {
        async function fetchProperties() {
            const { data, error } = await supabase
                .from('cohost_properties')
                .select('id, name, address')
                .order('name');

            if (data && data.length > 0) {
                setProperties(data);
                setSelectedPropertyId(data[0].id);
            }
        }
        fetchProperties();
    }, []);

    // 2. Fetch Feeds when property selected
    useEffect(() => {
        if (!selectedPropertyId) return;

        async function fetchFeeds() {
            setLoadingFeeds(true);
            const { data, error } = await supabase
                .from('ical_feeds')
                .select('*')
                .eq('property_id', selectedPropertyId)
                .order('created_at', { ascending: true });

            if (data) {
                setFeeds(data);
            }
            setLoadingFeeds(false);
        }
        fetchFeeds();
    }, [selectedPropertyId]);

    const selectedProperty = properties.find(p => p.id === selectedPropertyId);

    const handleAddFeed = async () => {
        const finalName = selectedFeedType === 'Other' ? newFeedName : selectedFeedType;

        if (!selectedPropertyId || !finalName || !newFeedUrl) return;

        // Determine source type
        let type = 'other';
        const lowerName = finalName.toLowerCase();
        if (lowerName.includes('airbnb')) type = 'airbnb';
        else if (lowerName.includes('vrbo')) type = 'vrbo';
        else if (lowerName.includes('booking')) type = 'booking';

        const { data, error } = await supabase
            .from('ical_feeds')
            .insert({
                property_id: selectedPropertyId,
                source_name: finalName,
                source_type: type,
                ical_url: newFeedUrl,
                is_active: true
            })
            .select()
            .single();

        if (data) {
            setFeeds([...feeds, data]);
            setIsAdding(false);
            setNewFeedName('');
            setSelectedFeedType('');
            setNewFeedUrl('');
        } else if (error) {
            alert('Error adding feed: ' + error.message);
        }
    };

    const toggleFeed = async (id: string, currentStatus: boolean) => {
        setFeeds(feeds.map(f => f.id === id ? { ...f, is_active: !currentStatus } : f));

        const { error } = await supabase
            .from('ical_feeds')
            .update({ is_active: !currentStatus })
            .eq('id', id);

        if (error) {
            setFeeds(feeds.map(f => f.id === id ? { ...f, is_active: currentStatus } : f));
            alert('Error updating feed');
        }
    };

    const deleteFeed = async (id: string) => {
        if (!confirm('Are you sure you want to delete this specific sync feed?')) return;

        const prevFeeds = [...feeds];
        setFeeds(feeds.filter(f => f.id !== id));

        const { error } = await supabase
            .from('ical_feeds')
            .delete()
            .eq('id', id);

        if (error) {
            setFeeds(prevFeeds);
            alert('Error deleting feed');
        }
    };

    const handleSyncFeed = async (feedId: string) => {
        if (!selectedPropertyId) return;
        setSyncingFeedId(feedId);
        try {
            const res = await fetch('/api/cohost/ical/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    property_id: selectedPropertyId,
                    feed_id: feedId
                })
            });
            const data = await res.json();

            if (res.ok) {
                const { data: updatedFeed } = await supabase
                    .from('ical_feeds')
                    .select('*')
                    .eq('id', feedId)
                    .single();

                if (updatedFeed) {
                    setFeeds(feeds.map(f => f.id === feedId ? updatedFeed : f));
                }
                alert('Sync complete!');
            } else {
                throw new Error(data.error || 'Sync failed');
            }
        } catch (err: any) {
            alert('Error syncing feed: ' + err.message);
        } finally {
            setSyncingFeedId(null);
        }
    };

    const handleSyncNow = async () => {
        if (!selectedPropertyId) return;
        setSyncing(true);
        try {
            const res = await fetch('/api/cohost/ical/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ property_id: selectedPropertyId })
            });
            const data = await res.json();

            if (res.ok) {
                alert(`Sync complete! Synced ${data.feeds_synced} feeds. Found ${data.events_found} events.`);
                const { data: updatedFeeds } = await supabase
                    .from('ical_feeds')
                    .select('*')
                    .eq('property_id', selectedPropertyId)
                    .order('created_at', { ascending: true });
                if (updatedFeeds) setFeeds(updatedFeeds);
            } else {
                throw new Error(data.error || 'Sync failed');
            }
        } catch (err: any) {
            alert('Error syncing calendars: ' + err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleCopyExportUrl = () => {
        if (!selectedPropertyId) return;
        const url = `https://navicohost.com/ical/export/${selectedPropertyId}.ics`;
        navigator.clipboard.writeText(url);
        alert('Export URL copied to clipboard!');
    };

    if (properties.length === 0) {
        return (
            <div className="flex bg-gray-50 h-full items-center justify-center p-8">
                <p className="text-gray-500">Loading properties...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Calendar Sync</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage iCal feeds and property synchronization</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Property Selector */}
                    <div className="relative">
                        <select
                            value={selectedPropertyId || ''}
                            onChange={(e) => setSelectedPropertyId(e.target.value)}
                            className="appearance-none pl-4 pr-10 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-shadow cursor-pointer min-w-[200px]"
                        >
                            {properties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>

                    {/* Sync Button */}
                    <button
                        onClick={handleSyncNow}
                        disabled={syncing || feeds.length === 0}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
                    >
                        {syncing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                                Syncing...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Sync Now
                            </>
                        )}
                    </button>
                </div>
            </header>

            {selectedProperty && (
                <div className="space-y-8 animate-fadeIn">
                    {/* Outbound Sync Section */}
                    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Outbound iCal Export
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Share this URL with other platforms (Airbnb, VRBO) to sync your bookings out.
                            </p>
                        </div>
                        <div className="p-6">
                            <div className="flex gap-2">
                                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-600 font-mono overflow-hidden whitespace-nowrap text-ellipsis">
                                    https://navicohost.com/ical/export/{selectedProperty.id}.ics
                                </div>
                                <button
                                    onClick={handleCopyExportUrl}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                    Copy
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Inbound Sync Section */}
                    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-wrap justify-between items-center gap-4">
                            <div>
                                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Inbound iCal Feeds
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Import bookings from other platforms to block dates here.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsAdding(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Feed
                            </button>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {/* Add Form */}
                            {isAdding && (
                                <div className="p-6 bg-blue-50 animate-fadeIn">
                                    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-4 items-end">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Source Name</label>
                                            <select
                                                value={selectedFeedType}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSelectedFeedType(val);
                                                    if (val !== 'Other') {
                                                        setNewFeedName(val);
                                                    } else {
                                                        setNewFeedName('');
                                                    }
                                                }}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                                            >
                                                <option value="">Select Platform</option>
                                                <option value="Airbnb">Airbnb</option>
                                                <option value="VRBO">VRBO</option>
                                                <option value="Booking.com">Booking.com</option>
                                                <option value="Other">Other (Custom)</option>
                                            </select>
                                            {selectedFeedType === 'Other' && (
                                                <input
                                                    type="text"
                                                    value={newFeedName}
                                                    placeholder="Enter Custom Name"
                                                    className="mt-2 w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                                                    onChange={(e) => setNewFeedName(e.target.value)}
                                                />
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">iCal Link (URL)</label>
                                            <input
                                                type="text"
                                                value={newFeedUrl}
                                                onChange={(e) => setNewFeedUrl(e.target.value)}
                                                placeholder="https://..."
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setIsAdding(false)}
                                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleAddFeed}
                                                disabled={!newFeedName || !newFeedUrl}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Feed List */}
                            {loadingFeeds ? (
                                <div className="p-8 text-center text-gray-500">Loading feeds...</div>
                            ) : feeds.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    No sync feeds added yet.
                                </div>
                            ) : (
                                feeds.map(feed => (
                                    <div key={feed.id} className="p-6 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-sm font-bold text-gray-900">{feed.source_name}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize border ${feed.source_type === 'airbnb' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                                    feed.source_type === 'vrbo' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                        'bg-gray-100 text-gray-700 border-gray-200'
                                                    }`}>
                                                    {feed.source_type}
                                                </span>
                                                {!feed.is_active && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                                                        Paused
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-2 mt-2">
                                                <p className="text-xs text-gray-500 font-mono truncate max-w-md" title={feed.ical_url}>
                                                    {feed.ical_url}
                                                </p>

                                                {feed.last_synced_at && (
                                                    <div className="space-y-2">
                                                        <span className="text-xs text-gray-400 flex items-center gap-1">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${feed.last_sync_status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                                                            Last synced: {new Date(feed.last_synced_at).toLocaleString()}
                                                        </span>

                                                        <details className="group/details">
                                                            <summary className="text-xs font-semibold text-blue-600 cursor-pointer hover:text-blue-700 select-none flex items-center gap-1 list-none">
                                                                <span>Diagnostics</span>
                                                                <svg className="w-3 h-3 transition-transform group-open/details:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            </summary>

                                                            <div className="mt-2 pl-2 border-l-2 border-gray-100 space-y-2 animate-fadeIn">
                                                                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono tracking-tight flex-wrap bg-gray-50 p-2 rounded border border-gray-100">
                                                                    {feed.last_http_status !== undefined ? (
                                                                        <span className={feed.last_http_status >= 400 || feed.last_http_status === 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                                                                            HTTP {feed.last_http_status}
                                                                        </span>
                                                                    ) : <span>HTTP -</span>}

                                                                    <span className="text-gray-300">|</span>
                                                                    <span title="Bookings currently in DB">
                                                                        DB: {feed.last_booking_count ?? 0}
                                                                    </span>
                                                                    <span className="text-gray-300">|</span>
                                                                    <span title="Events found in last sync" className={feed.last_event_count === 0 && feed.last_sync_status === 'success' ? 'text-yellow-600 font-bold' : ''}>
                                                                        Parsed: {feed.last_event_count ?? 0}
                                                                    </span>
                                                                    <span className="text-gray-300">|</span>
                                                                    <span className="truncate max-w-[80px]" title={feed.last_content_type}>
                                                                        {feed.last_content_type?.split(';')[0]}
                                                                    </span>

                                                                    {feed.last_final_url && feed.last_final_url !== feed.ical_url && (
                                                                        <>
                                                                            <span className="text-gray-300">|</span>
                                                                            <a href={feed.last_final_url} target="_blank" rel="noopener noreferrer" className="truncate max-w-[100px] hover:underline" title={`Redirected to: ${feed.last_final_url}`}>
                                                                                → {new URL(feed.last_final_url).hostname}
                                                                            </a>
                                                                        </>
                                                                    )}

                                                                    {feed.last_response_snippet && (
                                                                        <>
                                                                            <span className="text-gray-300">|</span>
                                                                            <details className="inline-block relative group">
                                                                                <summary className="cursor-pointer text-blue-500 hover:text-blue-700 list-none">
                                                                                    <span className="underline decoration-dotted">Raw</span>
                                                                                </summary>
                                                                                <div className="absolute top-100 left-0 mt-1 w-[400px] max-h-[300px] overflow-auto bg-white border border-gray-200 shadow-xl rounded-lg p-3 z-50 text-[10px] whitespace-pre-wrap font-mono text-gray-700 ring-1 ring-black/5">
                                                                                    <div className="font-bold text-gray-900 border-b border-gray-100 pb-1 mb-2">Response Snippet (First 500 chars)</div>
                                                                                    {feed.last_response_snippet}
                                                                                </div>
                                                                            </details>
                                                                        </>
                                                                    )}
                                                                </div>

                                                                {feed.last_error && (
                                                                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                                                                        <strong>Last Error:</strong> {feed.last_error}
                                                                    </div>
                                                                )}

                                                                <button
                                                                    onClick={() => setViewingFeedId(feed.id)}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                    View imported bookings
                                                                </button>
                                                            </div>
                                                        </details>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => handleSyncFeed(feed.id)}
                                                disabled={syncingFeedId === feed.id}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Sync this feed now"
                                            >
                                                <svg className={`w-4 h-4 ${syncingFeedId === feed.id ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            </button>
                                            <div className="h-4 w-px bg-gray-200" />
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={feed.is_active}
                                                    onChange={() => toggleFeed(feed.id, feed.is_active)}
                                                />
                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                            <button
                                                onClick={() => deleteFeed(feed.id)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete feed"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            )}

            {/* Bookings Modal */}
            {viewingFeedId && (
                <FeedBookingsModal
                    feedId={viewingFeedId}
                    onClose={() => setViewingFeedId(null)}
                />
            )}
        </div>
    );
}

// --- Sub-components ---

function FeedBookingsModal({ feedId, onClose }: { feedId: string; onClose: () => void }) {
    const supabase = createClient();
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchBookings() {
            const { data } = await supabase
                .from('bookings')
                .select('*')
                .eq('source_feed_id', feedId)
                .order('check_in', { ascending: false })
                .limit(50);

            if (data) setBookings(data);
            setLoading(false);
        }
        fetchBookings();
    }, [feedId, supabase]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900">Imported Bookings (Last 50)</h3>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-0 overflow-auto flex-1">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Loading bookings...</div>
                    ) : bookings.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No bookings found in database for this feed.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-gray-600 font-semibold sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">Guest/Summary</th>
                                    <th className="px-4 py-2">Check-in</th>
                                    <th className="px-4 py-2">Check-out</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">Ext ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {bookings.map(b => (
                                    <tr key={b.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-900">{b.guest_name}</td>
                                        <td className="px-4 py-2 text-gray-500 font-mono">{new Date(b.check_in).toISOString().split('T')[0]}</td>
                                        <td className="px-4 py-2 text-gray-500 font-mono">{new Date(b.check_out).toISOString().split('T')[0]}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {b.is_active ? 'Active' : 'Archived'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-gray-400 font-mono truncate max-w-[80px]" title={b.external_uid}>
                                            {b.external_uid}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
                    Sorted by check-in date (newest first). Max 50 shown.
                </div>
            </div>
        </div>
    );
}
