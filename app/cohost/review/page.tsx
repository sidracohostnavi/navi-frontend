'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
    ExclamationTriangleIcon,
    CheckCircleIcon,
    XMarkIcon,
    ArrowLeftIcon
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

export default function ReviewPage() {
    const supabase = createClient();
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolving, setResolving] = useState<string | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Fetch on mount - no memoization to ensure fresh data every time
    useEffect(() => {
        let isMounted = true;

        async function fetchItems() {
            try {
                setLoading(true);
                console.log('[ReviewPage] Fetching items via API (GUARDRAILS_V1)...');

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
                console.log('[ReviewPage] API Response:', data);

                if (data.error) {
                    throw new Error(data.error);
                }

                if (isMounted) {
                    setItems(data.items || []);
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
    }, []); // Empty deps - only run on mount

    const handleResolve = async (itemId: string) => {
        const propertyId = selectedProperty[itemId];
        if (!propertyId) {
            setMessage({ type: 'error', text: 'Please select a property first' });
            return;
        }

        setResolving(itemId);
        setMessage(null);

        try {
            const res = await fetch(`/api/cohost/review/${itemId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ property_id: propertyId })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to resolve');
            }

            if (data.action === 'created') {
                setMessage({ type: 'success', text: 'Booking created successfully!' });
            } else if (data.action === 'already_exists') {
                setMessage({ type: 'success', text: 'Booking already exists - marked as resolved.' });
            }

            // Remove from list
            setItems(prev => prev.filter(i => i.id !== itemId));

        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setResolving(null);
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
        return new Date(date).toLocaleDateString('en-US', {
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
                    {/* DEBUG: Show Workspace ID to verify environment divergence */}
                    {items.length > 0 && items[0].workspace_id && (
                        <p className="text-xs font-mono text-gray-400 mt-2">
                            Debug: Workspace {items[0].workspace_id}
                        </p>
                    )}
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
                        {items.map((item) => (
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
                                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                                {item.extracted_data?.guest_name || 'Unknown Guest'}
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                    item.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                                        item.status === 'dismissed' ? 'bg-gray-100 text-gray-800' :
                                                            'bg-blue-100 text-blue-800'
                                                    }`}>
                                                    {item.status.toUpperCase()}
                                                </span>
                                            </h3>
                                            <div className="text-sm text-gray-600 mt-1 space-y-1">
                                                <p>
                                                    <span className="font-medium">Dates:</span>{' '}
                                                    {formatDate(item.extracted_data?.check_in || '')} -{' '}
                                                    {formatDate(item.extracted_data?.check_out || '')}
                                                </p>
                                                {item.extracted_data?.guest_count && (
                                                    <p>
                                                        <span className="font-medium">Guests:</span>{' '}
                                                        {item.extracted_data.guest_count}
                                                    </p>
                                                )}
                                                {item.extracted_data?.confirmation_code && (
                                                    <p>
                                                        <span className="font-medium">Code:</span>{' '}
                                                        <span className="font-mono bg-gray-100 px-1 rounded">
                                                            {item.extracted_data.confirmation_code}
                                                        </span>
                                                    </p>
                                                )}
                                                {item.extracted_data?.listing_name && (
                                                    <p>
                                                        <span className="font-medium">Listing:</span>{' '}
                                                        {item.extracted_data.listing_name}
                                                    </p>
                                                )}
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
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
