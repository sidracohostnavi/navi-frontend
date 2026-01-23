'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AMENITIES_LIST, PROPERTY_TYPES, TIME_OPTIONS } from '../constants';

export default function PropertyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const supabase = createClient();

    // Tabs
    const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
    const [isAmenitiesExpanded, setIsAmenitiesExpanded] = useState(false);

    // Data State
    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Photos state
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    // (In a real app, these would come from a distinct table or jsonb array)
    const [images, setImages] = useState<string[]>([]);

    // Fetch Property
    useEffect(() => {
        async function fetchProperty() {
            try {
                const { data, error } = await supabase
                    .from('cohost_properties')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                setProperty(data);

                // If we stored images in an array column or separate table, load them here
                // For MVP, if there is a single image_url, we show it
                if (data.image_url) {
                    setImages([data.image_url]);
                }
            } catch (error) {
                console.error("Error fetching property:", error);
                // router.push('/cohost/properties'); // Redirect if not found
            } finally {
                setLoading(false);
            }
        }
        fetchProperty();
    }, [id, supabase, router]);

    // -- Handlers --

    const handleUpdate = async (updates: any) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('cohost_properties')
                .update(updates)
                .eq('id', id);

            if (error) throw error;

            // Optimistic update
            setProperty((prev: any) => ({ ...prev, ...updates }));
            alert('Changes saved!');
        } catch (e: any) {
            alert('Error updating property: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleAmenity = (amenity: string) => {
        setProperty((prev: any) => {
            const current = prev.amenities || [];
            const exists = current.includes(amenity);
            const updated = exists
                ? current.filter((a: string) => a !== amenity)
                : [...current, amenity];
            return { ...prev, amenities: updated };
        });
    };

    const updateRules = (ruleUpdates: any) => {
        const currentRules = property.house_rules || {};
        const updatedRules = { ...currentRules, ...ruleUpdates };
        setProperty((prev: any) => ({ ...prev, house_rules: updatedRules }));
        // We don't save immediately, user clicks save. 
        // But if we wanted auto-save we would call handleUpdate here.
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        setUploading(true);
        const file = e.target.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${id}/${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        try {
            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('property-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('property-images')
                .getPublicUrl(filePath);

            // Save to DB (Currently assume single image for MVP cover image)
            // Long term we want an array or separate table
            await handleUpdate({ image_url: publicUrl });

            // Update local state
            setImages([publicUrl]);
            setFiles([]);

        } catch (error: any) {
            alert('Error uploading image: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading details...</div>;
    if (!property) return <div className="p-8 text-center text-gray-500">Property not found.</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/cohost/properties" className="text-gray-400 hover:text-gray-600">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{property.name}</h1>
                            <p className="text-xs text-gray-500">{property.city}, {property.state}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Link href={`/cohost/calendar?propertyId=${id}`} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                            Calendar
                        </Link>
                        <button
                            onClick={() => alert("This would open the public listing preview.")}
                            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                        >
                            Preview Listing
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="max-w-6xl mx-auto px-4 flex gap-6 overflow-x-auto">
                    {[
                        { id: 'overview', label: 'Overview' },
                        { id: 'settings', label: 'Details & Settings' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-6">

                {/* --- OVERVIEW TAB --- */}
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-sm font-medium text-gray-500 mb-1">Total Bookings</h3>
                                <p className="text-2xl font-bold text-gray-900">0</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-sm font-medium text-gray-500 mb-1">Occupancy Rate</h3>
                                <p className="text-2xl font-bold text-gray-900">0%</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-sm font-medium text-gray-500 mb-1">Revenue (Mo)</h3>
                                <p className="text-2xl font-bold text-gray-900">$0</p>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-semibold text-gray-900">AI CoWidth Context</h3>
                                <button onClick={() => setActiveTab('settings')} className="text-sm text-blue-600 hover:underline">Edit</button>
                            </div>
                            <div className="p-6 bg-gray-50">
                                {property.ai_notes ? (
                                    <p className="text-gray-700 whitespace-pre-wrap">{property.ai_notes}</p>
                                ) : (
                                    <p className="text-gray-400 italic">No AI notes added yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- PHOTOS TAB REMOVED --- */}

                {/* --- SETTINGS TAB --- */}
                {activeTab === 'settings' && (
                    <div className="space-y-8 animate-fadeIn max-w-2xl mx-auto">

                        {/* Profile Image */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Property Image</h3>
                            <div className="flex items-start gap-6">
                                <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 relative group">
                                    {images[0] ? (
                                        <img src={images[0]} alt="Property Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </div>
                                    )}
                                    {uploading && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600">
                                        Upload a high-quality image to represents your property. This will be the main image shown on your listing card.
                                    </p>
                                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                                        {uploading ? 'Uploading...' : 'Change Image'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleUpload}
                                            disabled={uploading}
                                        />
                                    </label>
                                </div>
                            </div>
                        </section>

                        {/* Basic Info */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Basic Info</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Property Name</label>
                                <input
                                    className="w-full rounded-lg border-gray-300 border px-3 py-2"
                                    value={property.name}
                                    onChange={e => setProperty({ ...property, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select
                                        className="w-full rounded-lg border-gray-300 border px-3 py-2 bg-white"
                                        value={property.property_type}
                                        onChange={e => setProperty({ ...property, property_type: e.target.value })}
                                    >
                                        {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                                    <select
                                        className="w-full rounded-lg border-gray-300 border px-3 py-2 bg-white"
                                        value={property.timezone}
                                        onChange={e => setProperty({ ...property, timezone: e.target.value })}
                                    >
                                        {Intl.supportedValuesOf('timeZone').map(tz => <option key={tz}>{tz}</option>)}
                                    </select>
                                </div>
                            </div>
                        </section>

                        {/* Location */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Location</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                                <input
                                    className="w-full rounded-lg border-gray-300 border px-3 py-2"
                                    value={property.street_address || ''}
                                    onChange={e => setProperty({ ...property, street_address: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                    <input
                                        className="w-full rounded-lg border-gray-300 border px-3 py-2"
                                        value={property.city || ''}
                                        onChange={e => setProperty({ ...property, city: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                                    <input
                                        className="w-full rounded-lg border-gray-300 border px-3 py-2"
                                        value={property.state || ''}
                                        onChange={e => setProperty({ ...property, state: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                                    <input
                                        className="w-full rounded-lg border-gray-300 border px-3 py-2"
                                        value={property.country || ''}
                                        onChange={e => setProperty({ ...property, country: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Neighborhood</label>
                                    <input
                                        className="w-full rounded-lg border-gray-300 border px-3 py-2"
                                        value={property.neighborhood || ''}
                                        onChange={e => setProperty({ ...property, neighborhood: e.target.value })}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Capacity */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Capacity</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
                                    <input type="number" className="w-full rounded-lg border-gray-300 border px-3 py-2" value={property.max_guests || 0} onChange={e => setProperty({ ...property, max_guests: parseInt(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                                    <input type="number" className="w-full rounded-lg border-gray-300 border px-3 py-2" value={property.bedrooms || 0} onChange={e => setProperty({ ...property, bedrooms: parseInt(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Beds</label>
                                    <input type="number" className="w-full rounded-lg border-gray-300 border px-3 py-2" value={property.beds || 0} onChange={e => setProperty({ ...property, beds: parseInt(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                                    <input type="number" step="0.5" className="w-full rounded-lg border-gray-300 border px-3 py-2" value={property.bathrooms || 0} onChange={e => setProperty({ ...property, bathrooms: parseFloat(e.target.value) })} />
                                </div>
                            </div>
                        </section>

                        {/* Check-in & Entry */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Check-in & Entry</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
                                    <select className="w-full rounded-lg border-gray-300 border px-3 py-2 bg-white" value={property.check_in_time || '15:00'} onChange={e => setProperty({ ...property, check_in_time: e.target.value })}>
                                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time</label>
                                    <select className="w-full rounded-lg border-gray-300 border px-3 py-2 bg-white" value={property.check_out_time || '11:00'} onChange={e => setProperty({ ...property, check_out_time: e.target.value })}>
                                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Entry Method</label>
                                    <select className="w-full rounded-lg border-gray-300 border px-3 py-2 bg-white" value={property.entry_method || 'Smart lock'} onChange={e => setProperty({ ...property, entry_method: e.target.value })}>
                                        {['Smart lock', 'Lockbox', 'Keypad Lock', 'Key', 'In-person', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Instructions</label>
                                <textarea className="w-full rounded-lg border-gray-300 border px-3 py-2 h-24" value={property.check_in_instructions || ''} onChange={e => setProperty({ ...property, check_in_instructions: e.target.value })} placeholder="e.g. Code is 1234..." />
                            </div>
                        </section>

                        {/* House Rules */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">House Rules</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {['petsAllowed', 'smokingAllowed', 'eventsAllowed', 'childrenAllowed', 'quietHours', 'idRequired'].map(key => (
                                    <label key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                                        <span className="text-sm font-medium text-gray-700">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                                        <input type="checkbox" checked={property.house_rules?.[key] || false} onChange={e => updateRules({ [key]: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
                                    </label>
                                ))}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Rules</label>
                                <textarea className="w-full rounded-lg border-gray-300 border px-3 py-2 h-24" value={property.house_rules?.notes || ''} onChange={e => updateRules({ notes: e.target.value })} />
                            </div>
                        </section>

                        {/* Amenities */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div
                                className="flex items-center justify-between cursor-pointer"
                                onClick={() => setIsAmenitiesExpanded(!isAmenitiesExpanded)}
                            >
                                <h3 className="font-semibold text-gray-900">Amenities ({property.amenities?.length || 0})</h3>
                                <button className="text-gray-500">
                                    <svg className={`w-5 h-5 transition-transform ${isAmenitiesExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            </div>

                            {isAmenitiesExpanded && (
                                <div className="space-y-6 mt-6 animate-fadeIn border-t pt-4">
                                    {Object.entries(AMENITIES_LIST).map(([category, items]) => (
                                        <div key={category}>
                                            <h4 className="text-sm font-medium text-gray-700 mb-3">{category}</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {items.map(amenity => (
                                                    <label key={amenity} className="flex items-center gap-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={(property.amenities || []).includes(amenity)}
                                                            onChange={() => toggleAmenity(amenity)}
                                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                                                        />
                                                        <span className="text-sm text-gray-600">{amenity}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* AI Notes */}
                        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">AI Context</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Details</label>
                                <p className="text-xs text-gray-500 mb-2">Used by the AI Co-Host to answer guest questions.</p>
                                <textarea
                                    className="w-full rounded-lg border-gray-300 border px-3 py-2 h-32"
                                    value={property.ai_notes || ''}
                                    onChange={e => setProperty({ ...property, ai_notes: e.target.value })}
                                />
                            </div>
                        </section>

                        <div className="flex justify-end pt-4">
                            <button
                                onClick={() => handleUpdate(property)}
                                disabled={saving}
                                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-70"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>

                    </div>
                )}
            </main>
        </div>
    );
}
