'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { getPermissionsForRole } from '@/lib/roles/roleConfig';

type Property = {
    id: string;
    name: string;
    image_url?: string;
    city?: string;
    state?: string;
    is_active?: boolean; // column must exist in DB for disable to work
};

export default function PropertiesPage() {
    const supabase = createClient();
    const router = useRouter();

    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);

    // Delete confirmation modal
    const [confirmDelete, setConfirmDelete] = useState<Property | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchProperties() {
            try {
                const roleRes = await fetch('/api/cohost/users/role');
                if (roleRes.ok) {
                    const roleData = await roleRes.json();
                    const perms = getPermissionsForRole(roleData.role);
                    if (!perms.canViewProperties) {
                        router.replace('/cohost/calendar');
                        return;
                    }
                }

                const { data, error } = await supabase
                    .from('cohost_properties')
                    .select('id, name, image_url, city, state')
                    .order('name');
                if (data) setProperties(data);
                if (error) console.error('Properties fetch error:', error.message);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        fetchProperties();
    }, [router, supabase]);

    const handleToggleActive = async (p: Property) => {
        setTogglingId(p.id);
        const newActive = p.is_active === false ? true : false; // default undefined = active
        try {
            const res = await fetch(`/api/cohost/properties/${p.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: newActive }),
            });
            if (res.ok) {
                setProperties(prev =>
                    prev.map(x => x.id === p.id ? { ...x, is_active: newActive } : x)
                );
            }
        } finally {
            setTogglingId(null);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/cohost/properties/${confirmDelete.id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setProperties(prev => prev.filter(x => x.id !== confirmDelete.id));
                setConfirmDelete(null);
            }
        } finally {
            setDeleting(false);
        }
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
                        onClick={() => router.push('/cohost/onboarding?new=true')}
                        className="px-4 py-2 bg-[#008080] text-white font-medium rounded-lg shadow-sm hover:bg-[#006666] transition-colors flex items-center gap-2"
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
                                onClick={() => router.push('/cohost/onboarding?new=true')}
                                className="px-4 py-2 bg-[#008080] text-white font-medium rounded-lg shadow-sm hover:bg-[#006666] transition-colors inline-flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Property
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {properties.map(p => {
                                const isDisabled = p.is_active === false;
                                return (
                                    <div key={p.id} className={`p-6 flex items-center justify-between transition-colors ${isDisabled ? 'bg-gray-50 opacity-70' : 'hover:bg-gray-50'}`}>
                                        <div className="flex items-center gap-4">
                                            {p.image_url ? (
                                                <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                                                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className="w-12 h-12 bg-[#008080]/10 rounded-lg flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-[#008080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                                    </svg>
                                                </div>
                                            )}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-medium text-gray-900">{p.name}</h3>
                                                    {isDisabled && (
                                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Disabled</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    {p.city && p.state ? `${p.city}, ${p.state}` : 'Managed Property'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Link
                                                href={`/cohost/properties/${p.id}`}
                                                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 border border-transparent rounded-lg hover:bg-black transition-colors"
                                            >
                                                Manage
                                            </Link>
                                            <Link
                                                href={`/cohost/calendar?propertyId=${p.id}`}
                                                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                            >
                                                Calendar
                                            </Link>
                                            {/* Disable / Enable */}
                                            <button
                                                onClick={() => handleToggleActive(p)}
                                                disabled={togglingId === p.id}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                                                    isDisabled
                                                        ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                                                        : 'text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100'
                                                }`}
                                            >
                                                {togglingId === p.id ? '…' : isDisabled ? 'Enable' : 'Disable'}
                                            </button>
                                            {/* Delete */}
                                            <button
                                                onClick={() => setConfirmDelete(p)}
                                                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Delete confirmation modal */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Delete property?</h3>
                                <p className="text-sm text-gray-500 mt-0.5">This permanently deletes <strong>{confirmDelete.name}</strong> and all its data. This cannot be undone.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors text-sm disabled:opacity-60"
                            >
                                {deleting ? 'Deleting…' : 'Yes, delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
