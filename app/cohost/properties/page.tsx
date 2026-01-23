'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// Types
type Property = {
    id: string;
    name: string;
    image_url?: string;
    city?: string;
    state?: string;
};

export default function PropertiesPage() {
    const supabase = createClient();
    const router = useRouter();

    // Data State
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [importUrl, setImportUrl] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [urlError, setUrlError] = useState('');

    useEffect(() => {
        async function fetchProperties() {
            try {
                const { data } = await supabase
                    .from('cohost_properties')
                    .select('id, name, image_url, city, state')
                    .order('name');
                if (data) setProperties(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        fetchProperties();
    }, []);

    const handleImport = async () => {
        setUrlError('');
        if (!importUrl) {
            setUrlError('Please enter a listing URL');
            return;
        }
        // Basic basic validation
        if (!importUrl.startsWith('http')) {
            setUrlError('URL must start with http or https');
            return;
        }

        setIsValidating(true);
        // Simulate validation delay or proceed immediately
        // In real app we might ping an endpoint to check if valid
        // For now, just navigate
        const encodedUrl = encodeURIComponent(importUrl);
        router.push(`/cohost/properties/new?importUrl=${encodedUrl}`);
        // setIsModalOpen(false); // No need to close, we are navigating
    };

    const handleSkip = () => {
        router.push('/cohost/properties/new');
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
                        <p className="text-gray-600 mt-1">Manage your listings and property details.</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Property
                    </button>
                </header>

                {/* Property List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-gray-500">Loading properties...</div>
                    ) : properties.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">No properties yet</h3>
                            <p className="text-gray-500 mt-2 mb-6">Add your first property to start managing bookings.</p>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Property
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {properties.map(p => (
                                <div key={p.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        {p.image_url ? (
                                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                                                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                                </svg>
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="text-sm font-medium text-gray-900">{p.name}</h3>
                                            <p className="text-xs text-gray-500">
                                                {p.city && p.state ? `${p.city}, ${p.state}` : 'Managed Property'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Link
                                            href={`/cohost/properties/${p.id}`}
                                            className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 border border-transparent rounded-lg hover:bg-black transition-colors"
                                        >
                                            Manage
                                        </Link>
                                        <Link
                                            href={`/cohost/calendar?propertyId=${p.id}`}
                                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                        >
                                            Calendar
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Onboarding Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-fadeIn">
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900">Add New Property</h3>
                                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900 mb-2">Import from existing listing</h4>
                                    <input
                                        type="url"
                                        placeholder="Paste your Airbnb/VRBO/Booking.com listing URL"
                                        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${urlError ? 'border-red-300 focus:ring-red-200' : 'border-gray-300'}`}
                                        value={importUrl}
                                        onChange={e => {
                                            setImportUrl(e.target.value);
                                            setUrlError('');
                                        }}
                                    />
                                    {urlError && <p className="text-xs text-red-600 mt-1.5">{urlError}</p>}
                                    <p className="text-xs text-blue-600 bg-blue-50 py-2 px-3 rounded mt-3">
                                        ✨ We’ll pre-fill your property details and amenities. You can review everything before saving.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={handleImport}
                                        disabled={isValidating}
                                        className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isValidating ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            'Import & Continue'
                                        )}
                                    </button>

                                    <div className="relative flex py-1 items-center">
                                        <div className="flex-grow border-t border-gray-200"></div>
                                        <span className="flex-shrink-0 mx-2 text-xs text-gray-400">OR</span>
                                        <div className="flex-grow border-t border-gray-200"></div>
                                    </div>

                                    <button
                                        onClick={handleSkip}
                                        className="w-full py-2.5 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        Skip import (manual setup)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
