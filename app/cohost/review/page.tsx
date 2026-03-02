'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
    ExclamationTriangleIcon,
    CheckCircleIcon,
    XMarkIcon,
    ArrowLeftIcon,
    PlusCircleIcon
} from '@heroicons/react/24/outline';

type ReviewItem = {
    id: string;
    workspace_id: string;
    connection_id: string;
    extracted_data: {
        guest_name?: string;
        check_in?: string;
        check_out?: string;
        guest_count?: number;
        confirmation_code?: string;
        listing_name?: string;
        gmail_message_id?: string;
    } | null;
    suggested_matches: any | null;
    status: string;
    created_at: string;
};

type Property = {
    id: string;
    name: string;
};

// Per-item editable state
type ItemEdits = {
    guest_name: string;
    guest_count: number;
};

// Manual booking form state
type ManualForm = {
    itemId: string;
    propertyId: string;
    propertyName: string;
    check_in: string;
    check_out: string;
    guest_name: string;
    guest_count: number;
    label_text: string;
    platform: string;
};

/**
 * Derive platform from confirmation code prefix.
 */
function derivePlatform(code: string | null | undefined): string {
    if (!code) return 'Other';
    if (code.startsWith('HM')) return 'Airbnb';
    if (/^B\d/.test(code)) return 'Lodgify';
    return 'Other';
}

export default function ReviewPage() {
    const supabase = createClient();
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolving, setResolving] = useState<string | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Editable fields per item
    const [itemEdits, setItemEdits] = useState<Record<string, ItemEdits>>({});

    // Manual booking form (shown when no unenriched booking found)
    const [manualForm, setManualForm] = useState<ManualForm | null>(null);
    const [submittingManual, setSubmittingManual] = useState(false);

    // Initialize editable fields when items load
    const initEdits = (loadedItems: ReviewItem[]) => {
        const edits: Record<string, ItemEdits> = {};
        for (const item of loadedItems) {
            edits[item.id] = {
                guest_name: item.extracted_data?.guest_name || '',
                guest_count: item.extracted_data?.guest_count || 1
            };
        }
        setItemEdits(edits);
    };

    // Fetch on mount
    useEffect(() => {
        let isMounted = true;

        async function fetchItems() {
            try {
                setLoading(true);
                const res = await fetch(`/api/cohost/review/items?_t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
                });

                if (res.status === 403) {
                    setMessage({ type: 'error', text: 'Access Denied: You are not a member of this workspace.' });
                    setLoading(false);
                    return;
                }

                const data = await res.json();
                if (data.error) throw new Error(data.error);

                if (isMounted) {
                    setItems(data.items || []);
                    initEdits(data.items || []);
                }
            } catch (err: any) {
                console.error('[ReviewPage] API Error:', err);
                setMessage({ type: 'error', text: err.message });
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        async function fetchProperties() {
            try {
                const { data } = await supabase
                    .from('cohost_properties')
                    .select('id, name')
                    .order('name');
                if (isMounted) setProperties(data || []);
            } catch (err) {
                console.error('Failed to fetch properties:', err);
            }
        }

        fetchItems();
        fetchProperties();

        return () => { isMounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleResolve = async (itemId: string) => {
        const propertyId = selectedProperty[itemId];
        if (!propertyId) {
            setMessage({ type: 'error', text: 'Please select a property first' });
            return;
        }

        setResolving(itemId);
        setMessage(null);

        const edits = itemEdits[itemId];

        try {
            const res = await fetch(`/api/cohost/review/${itemId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    property_id: propertyId,
                    guest_name: edits?.guest_name,
                    guest_count: edits?.guest_count
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to resolve');
            }

            if (data.action === 'enriched') {
                setMessage({ type: 'success', text: 'Booking enriched successfully!' });
                setItems(prev => prev.filter(i => i.id !== itemId));
            } else if (data.action === 'already_resolved') {
                setMessage({ type: 'success', text: 'Already resolved.' });
                setItems(prev => prev.filter(i => i.id !== itemId));
            } else if (data.action === 'no_match') {
                // No unenriched booking found — show manual booking form
                const item = items.find(i => i.id === itemId);
                const prop = properties.find(p => p.id === propertyId);
                if (item && prop) {
                    setManualForm({
                        itemId: item.id,
                        propertyId: propertyId,
                        propertyName: prop.name,
                        check_in: item.extracted_data?.check_in || '',
                        check_out: item.extracted_data?.check_out || '',
                        guest_name: edits?.guest_name || item.extracted_data?.guest_name || '',
                        guest_count: edits?.guest_count ?? item.extracted_data?.guest_count ?? 1,
                        label_text: '',
                        platform: data.platform || derivePlatform(item.extracted_data?.confirmation_code)
                    });
                }
                setMessage({ type: 'error', text: 'No unenriched booking found on those dates. Use the form below to create a manual booking.' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setResolving(null);
        }
    };

    const handleManualSubmit = async () => {
        if (!manualForm) return;
        setSubmittingManual(true);
        setMessage(null);

        try {
            const res = await fetch(`/api/cohost/review/${manualForm.itemId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create_manual',
                    property_id: manualForm.propertyId,
                    guest_name: manualForm.guest_name,
                    guest_count: manualForm.guest_count,
                    check_in: manualForm.check_in,
                    check_out: manualForm.check_out,
                    label_text: manualForm.label_text
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create manual booking');
            }

            setMessage({ type: 'success', text: 'Manual booking created successfully!' });
            setItems(prev => prev.filter(i => i.id !== manualForm.itemId));
            setManualForm(null);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSubmittingManual(false);
        }
    };

    const handleDismiss = async (itemId: string) => {
        setResolving(itemId);
        setMessage(null);

        try {
            const res = await fetch(`/api/cohost/review/${itemId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismiss' })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to dismiss');
            }

            setMessage({ type: 'success', text: 'Item dismissed.' });
            setItems(prev => prev.filter(i => i.id !== itemId));
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setResolving(null);
        }
    };

    const formatDate = (date: string) => {
        if (!date) return '-';
        return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/cohost/calendar"
                        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
                    >
                        <ArrowLeftIcon className="w-4 h-4" />
                        Back to Calendar
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">Review Inbox</h1>
                    <p className="text-gray-600 mt-1">
                        Email-confirmed bookings that need property assignment
                    </p>
                </div>

                {/* Message */}
                {message && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                        }`}>
                        {message.type === 'success' ? (
                            <CheckCircleIcon className="w-5 h-5" />
                        ) : (
                            <ExclamationTriangleIcon className="w-5 h-5" />
                        )}
                        {message.text}
                    </div>
                )}

                {/* Manual Booking Form (shown when no unenriched booking found) */}
                {manualForm && (
                    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <PlusCircleIcon className="w-6 h-6 text-amber-600" />
                            <h3 className="font-semibold text-gray-900">Create Manual Booking</h3>
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                Manually Added — will not sync to Airbnb/VRBO
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {/* Property (locked) */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Property</label>
                                <input
                                    type="text"
                                    value={manualForm.propertyName}
                                    disabled
                                    className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                                />
                            </div>
                            {/* Platform (read-only derived) */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
                                <input
                                    type="text"
                                    value={manualForm.platform}
                                    disabled
                                    className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                                />
                            </div>
                            {/* Check-in */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Check-in</label>
                                <input
                                    type="date"
                                    value={manualForm.check_in}
                                    onChange={(e) => setManualForm(prev => prev ? { ...prev, check_in: e.target.value } : null)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            {/* Check-out */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Check-out</label>
                                <input
                                    type="date"
                                    value={manualForm.check_out}
                                    onChange={(e) => setManualForm(prev => prev ? { ...prev, check_out: e.target.value } : null)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            {/* Guest Name */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Guest Name</label>
                                <input
                                    type="text"
                                    value={manualForm.guest_name}
                                    onChange={(e) => setManualForm(prev => prev ? { ...prev, guest_name: e.target.value } : null)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            {/* Guest Count */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Guest Count</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={manualForm.guest_count}
                                    onChange={(e) => setManualForm(prev => prev ? { ...prev, guest_count: parseInt(e.target.value) || 1 } : null)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            {/* Label */}
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
                                <input
                                    type="text"
                                    value={manualForm.label_text}
                                    onChange={(e) => setManualForm(prev => prev ? { ...prev, label_text: e.target.value } : null)}
                                    placeholder="e.g. Direct booking, Owner stay, Friend..."
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-amber-200">
                            <button
                                onClick={handleManualSubmit}
                                disabled={submittingManual || !manualForm.guest_name || !manualForm.check_in || !manualForm.check_out}
                                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {submittingManual ? 'Creating...' : 'Create Manual Booking'}
                            </button>
                            <button
                                onClick={() => setManualForm(null)}
                                className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Content */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                        <p className="text-gray-500 mt-4">Loading review items...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                        <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
                        <p className="text-gray-500">No pending review items.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item) => {
                            const edits = itemEdits[item.id];
                            const platform = derivePlatform(item.extracted_data?.confirmation_code);

                            return (
                                <div
                                    key={item.id}
                                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="p-2 bg-yellow-100 rounded-lg">
                                                <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {/* Editable Guest Name */}
                                                <div className="flex items-center gap-2 mb-1">
                                                    <input
                                                        type="text"
                                                        value={edits?.guest_name ?? item.extracted_data?.guest_name ?? ''}
                                                        onChange={(e) => setItemEdits(prev => ({
                                                            ...prev,
                                                            [item.id]: { ...prev[item.id], guest_name: e.target.value }
                                                        }))}
                                                        className="font-semibold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-0.5 py-0 bg-transparent min-w-[120px]"
                                                        placeholder="Guest name"
                                                    />
                                                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                        item.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                                            item.status === 'dismissed' ? 'bg-gray-100 text-gray-800' :
                                                                'bg-blue-100 text-blue-800'
                                                        }`}>
                                                        {item.status.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-600 mt-1 space-y-1">
                                                    <p>
                                                        <span className="font-medium">Dates:</span>{' '}
                                                        {formatDate(item.extracted_data?.check_in || '')} –{' '}
                                                        {formatDate(item.extracted_data?.check_out || '')}
                                                    </p>
                                                    {/* Editable Guest Count */}
                                                    <p className="flex items-center gap-1">
                                                        <span className="font-medium">Guests:</span>{' '}
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={30}
                                                            value={edits?.guest_count ?? item.extracted_data?.guest_count ?? 1}
                                                            onChange={(e) => setItemEdits(prev => ({
                                                                ...prev,
                                                                [item.id]: { ...prev[item.id], guest_count: parseInt(e.target.value) || 1 }
                                                            }))}
                                                            className="w-14 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-0.5 py-0 bg-transparent text-sm"
                                                        />
                                                    </p>
                                                    {item.extracted_data?.confirmation_code && (
                                                        <p>
                                                            <span className="font-medium">Code:</span>{' '}
                                                            <span className="font-mono bg-gray-100 px-1 rounded">
                                                                {item.extracted_data.confirmation_code}
                                                            </span>
                                                        </p>
                                                    )}
                                                    {/* Platform (derived from code) */}
                                                    <p>
                                                        <span className="font-medium">Platform:</span>{' '}
                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${platform === 'Airbnb' ? 'bg-rose-100 text-rose-700' :
                                                            platform === 'Lodgify' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {platform}
                                                        </span>
                                                    </p>
                                                </div>
                                                <p className="text-xs text-gray-400 mt-2">
                                                    Detected {new Date(item.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
                                        <select
                                            value={selectedProperty[item.id] || ''}
                                            onChange={(e) => setSelectedProperty(prev => ({
                                                ...prev,
                                                [item.id]: e.target.value
                                            }))}
                                            className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="">Select Property...</option>
                                            {properties.map((prop) => (
                                                <option key={prop.id} value={prop.id}>
                                                    {prop.name}
                                                </option>
                                            ))}
                                        </select>

                                        <button
                                            onClick={() => handleResolve(item.id)}
                                            disabled={resolving === item.id || !selectedProperty[item.id]}
                                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {resolving === item.id ? 'Assigning...' : 'Assign to Property'}
                                        </button>

                                        <button
                                            onClick={() => handleDismiss(item.id)}
                                            disabled={resolving === item.id}
                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                            title="Dismiss"
                                        >
                                            <XMarkIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
