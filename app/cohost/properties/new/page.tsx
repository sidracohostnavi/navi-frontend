'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AMENITIES_LIST, PROPERTY_TYPES, TIME_OPTIONS } from '../constants';

// --- Constants & Types ---
const STEPS = [
    { title: 'Basics', id: 'basics' },
    { title: 'Location', id: 'location' },
    { title: 'Capacity', id: 'capacity' },
    { title: 'Amenities', id: 'amenities' },
    { title: 'Rules', id: 'rules' },
    { title: 'Check-in', id: 'checkin' },
    { title: 'Additional Details', id: 'ai-context' },
    { title: 'Review', id: 'review' }
];

// Constants imported from ../constants.ts

// Wrapper component with Suspense boundary
export default function NewPropertyWizard() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div></div>}>
            <NewPropertyWizardInner />
        </Suspense>
    );
}

function NewPropertyWizardInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    // -- State --
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [importUrl, setImportUrl] = useState<string | null>(null);

    // Form Data
    const [formData, setFormData] = useState({
        // Basics
        name: '',
        propertyType: 'House',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

        // Location
        streetAddress: '',
        city: '',
        state: '',
        country: '',
        neighborhood: '',

        // Capacity
        maxGuests: 4,
        bedrooms: 2,
        beds: 2,
        bathrooms: 1,

        // Amenities (Array of strings)
        amenities: [] as string[],

        // Rules
        houseRules: {
            petsAllowed: false,
            smokingAllowed: false,
            eventsAllowed: false,
            childrenAllowed: true,
            quietHours: false,
            idRequired: false,
            notes: ''
        },

        // Check-in
        checkInTime: '15:00',
        checkOutTime: '11:00',
        entryMethod: 'Smart lock',
        checkInInstructions: '',

        // AI Context
        aiNotes: ''
    });

    useEffect(() => {
        const url = searchParams.get('importUrl');
        if (url) setImportUrl(url);
    }, [searchParams]);

    // -- Handlers --

    const updateData = (updates: Partial<typeof formData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const updateRules = (updates: Partial<typeof formData.houseRules>) => {
        setFormData(prev => ({
            ...prev,
            houseRules: { ...prev.houseRules, ...updates }
        }));
    };

    const toggleAmenity = (amenity: string) => {
        setFormData(prev => {
            const exists = prev.amenities.includes(amenity);
            return {
                ...prev,
                amenities: exists
                    ? prev.amenities.filter(a => a !== amenity)
                    : [...prev.amenities, amenity]
            };
        });
    };

    const handleImport = async () => {
        if (!importUrl) return;
        setLoading(true);
        try {
            const res = await fetch('/api/cohost/properties/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: importUrl })
            });

            if (!res.ok) throw new Error('Failed to fetch listing data');

            const { data } = await res.json();

            // Map imported data to form state
            // Prioritize imported fields but keep existing if undefined
            setFormData(prev => ({
                ...prev,
                name: data.name || prev.name,
                // propertyType: Infer?

                // Location
                streetAddress: data.streetAddress || prev.streetAddress,
                city: data.city || prev.city,
                state: data.state || prev.state,
                country: data.country || prev.country,

                // Capacity
                maxGuests: data.maxGuests || prev.maxGuests,
                bedrooms: data.bedrooms || prev.bedrooms,
                beds: data.beds || prev.beds,
                bathrooms: data.bathrooms || prev.bathrooms,

                // Amenities - Merge, don't overwrite if manual already added?
                // Step implies "Import" button, usually overwrite or merge strategy
                amenities: Array.from(new Set([...prev.amenities, ...(data.amenities || [])])),

                // AI Notes often useful for description
                aiNotes: data.description ? `Imported Description:\n${data.description}\n\n${prev.aiNotes}` : prev.aiNotes
            }));

            alert('Import Successful! Please review the details in each step.');

        } catch (error: any) {
            console.error(error);
            alert('Import failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            // Basic validation
            if (currentStep === 0 && !formData.name) return alert('Property Name is required');
            setCurrentStep(s => s + 1);
            window.scrollTo(0, 0);
        } else {
            handleSubmit();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(s => s - 1);
        } else {
            router.push('/cohost/properties');
        }
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // Get current user workspace (Assuming single workspace for MVP context or getting first)
            // Real app would let user pick workspace or use context
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // Look up workspace member
            let membershipData = null;
            const { data: membership } = await supabase.from('cohost_workspace_members')
                .select('workspace_id')
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();

            membershipData = membership;

            if (!membershipData) {
                console.log("No workspace found, auto-creating...");
                // Create default workspace
                const wsSlug = `ws-${Date.now()}`;
                const { data: newWs, error: wsError } = await supabase.from('cohost_workspaces').insert({
                    name: 'My Workspace',
                    slug: wsSlug,
                    owner_id: user.id
                }).select('id').single();

                if (wsError) throw wsError;

                // Add member (self)
                // Note: Policy update 010 allows this
                const { error: memError } = await supabase.from('cohost_workspace_members').insert({
                    workspace_id: newWs.id,
                    user_id: user.id,
                    role: 'owner'
                });

                if (memError) throw memError;

                membershipData = { workspace_id: newWs.id };
            }

            const { error } = await supabase.from('cohost_properties').insert({
                workspace_id: membershipData.workspace_id,
                name: formData.name,
                property_type: formData.propertyType,
                timezone: formData.timezone,
                street_address: formData.streetAddress,
                city: formData.city,
                state: formData.state,
                country: formData.country,
                neighborhood: formData.neighborhood,
                max_guests: formData.maxGuests,
                bedrooms: formData.bedrooms,
                beds: formData.beds,
                bathrooms: formData.bathrooms,
                amenities: formData.amenities,
                house_rules: formData.houseRules, // Supabase JSONB
                check_in_time: formData.checkInTime,
                check_out_time: formData.checkOutTime,
                entry_method: formData.entryMethod,
                check_in_instructions: formData.checkInInstructions,
                ai_notes: formData.aiNotes
            });

            if (error) throw error;

            console.log("Property Created!"); // In place of toast for now
            alert("Property created successfully!");
            router.push('/cohost/properties');

        } catch (error: any) {
            alert("Error creating property: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // -- Render Steps --
    const renderStep = () => {
        switch (currentStep) {
            // ... (previous code)
            case 0: // Basics
                return (
                    <div className="space-y-6 animate-fadeIn">

                        {/* Import Section */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-8">
                            <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Import from Listing (Airbnb / VRBO)
                            </h3>
                            <p className="text-sm text-blue-700 mb-4">
                                Paste your public listing URL below and we'll fill in the details for you.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="flex-1 rounded-lg border-blue-200 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm placeholder-blue-300 bg-white"
                                    placeholder="https://airbnb.com/rooms/..."
                                    value={importUrl || ''}
                                    onChange={e => setImportUrl(e.target.value)}
                                />
                                <button
                                    onClick={handleImport}
                                    disabled={loading || !importUrl}
                                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                                >
                                    {loading ? 'Importing...' : 'Import Details'}
                                </button>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-white px-2 text-sm text-gray-400 font-medium">OR ENTER MANUALLY</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Property Name *</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.name}
                                onChange={e => updateData({ name: e.target.value })}
                                placeholder="e.g. Sunset Villa"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                {PROPERTY_TYPES.map(type => (
                                    <button
                                        key={type}
                                        onClick={() => updateData({ propertyType: type })}
                                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${formData.propertyType === type
                                            ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
                                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone *</label>
                            <select
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={formData.timezone}
                                onChange={e => updateData({ timezone: e.target.value })}
                            >
                                {Intl.supportedValuesOf('timeZone').map(tz => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Defaults to your detected location</p>
                        </div>
                    </div>
                );
            case 1: // Location
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.streetAddress}
                                onChange={e => updateData({ streetAddress: e.target.value })}
                                placeholder="e.g. 123 Main St, Apt 4B"
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.city}
                                    onChange={e => updateData({ city: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">State / Region</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.state}
                                    onChange={e => updateData({ state: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.country}
                                onChange={e => updateData({ country: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Neighborhood / Area</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.neighborhood}
                                onChange={e => updateData({ neighborhood: e.target.value })}
                                placeholder="e.g. Downtown, Beachfront"
                            />
                        </div>
                    </div>
                );
            case 2: // Capacity
                return (
                    <div className="space-y-8 animate-fadeIn">
                        {[
                            { label: 'Max Guests', key: 'maxGuests' },
                            { label: 'Bedrooms', key: 'bedrooms' },
                            { label: 'Beds', key: 'beds' },
                            { label: 'Bathrooms', key: 'bathrooms', step: 0.5 }
                        ].map((item: any) => (
                            <div key={item.key} className="flex items-center justify-between">
                                <span className="text-gray-900 font-medium">{item.label}</span>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => updateData({ [item.key]: Math.max(0, (formData as any)[item.key] - (item.step || 1)) })}
                                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                                    >
                                        -
                                    </button>
                                    <span className="w-8 text-center font-medium text-gray-900">{(formData as any)[item.key]}</span>
                                    <button
                                        onClick={() => updateData({ [item.key]: (formData as any)[item.key] + (item.step || 1) })}
                                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 3: // Amenities
                return (
                    <div className="space-y-8 animate-fadeIn">
                        {Object.entries(AMENITIES_LIST).map(([category, items]) => (
                            <div key={category}>
                                <h3 className="font-semibold text-gray-900 mb-3">{category}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {items.map(amenity => (
                                        <label key={amenity} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.amenities.includes(amenity)}
                                                onChange={() => toggleAmenity(amenity)}
                                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                                            />
                                            <span className="text-sm text-gray-700">{amenity}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 4: // House Rules
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-4">
                            {[
                                { label: 'Pets allowed', key: 'petsAllowed' },
                                { label: 'Smoking allowed', key: 'smokingAllowed' },
                                { label: 'Events allowed', key: 'eventsAllowed' },
                                { label: 'Children allowed', key: 'childrenAllowed' },
                                { label: 'Quiet hours', key: 'quietHours' },
                                { label: 'ID required for check-in', key: 'idRequired' },
                            ].map((rule: any) => (
                                <div key={rule.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                    <span className="font-medium text-gray-900">{rule.label}</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={(formData.houseRules as any)[rule.key]}
                                            onChange={e => updateRules({ [rule.key]: e.target.checked })}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                            ))}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Rules / Notes</label>
                            <textarea
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none h-32"
                                value={formData.houseRules.notes}
                                onChange={e => updateRules({ notes: e.target.value })}
                                placeholder="e.g. Please remove shoes inside..."
                            />
                        </div>
                    </div>
                );
            case 5: // Check-in
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
                                <select
                                    className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    value={formData.checkInTime}
                                    onChange={e => updateData({ checkInTime: e.target.value })}
                                >
                                    {TIME_OPTIONS.map(time => {
                                        const [h, m] = time.split(':').map(Number);
                                        const period = h >= 12 ? 'PM' : 'AM';
                                        const h12 = h % 12 || 12;
                                        const label = `${h12}:${m.toString().padStart(2, '0')} ${period}`;
                                        return <option key={time} value={time}>{label}</option>;
                                    })}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time</label>
                                <select
                                    className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    value={formData.checkOutTime}
                                    onChange={e => updateData({ checkOutTime: e.target.value })}
                                >
                                    {TIME_OPTIONS.map(time => {
                                        const [h, m] = time.split(':').map(Number);
                                        const period = h >= 12 ? 'PM' : 'AM';
                                        const h12 = h % 12 || 12;
                                        const label = `${h12}:${m.toString().padStart(2, '0')} ${period}`;
                                        return <option key={time} value={time}>{label}</option>;
                                    })}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Entry Method</label>
                            <select
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={formData.entryMethod}
                                onChange={e => updateData({ entryMethod: e.target.value })}
                            >
                                <option>Smart lock</option>
                                <option>Lockbox</option>
                                <option>Keypad Lock</option>
                                <option>Key</option>
                                <option>In-person</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Instructions (Internal)</label>
                            <textarea
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none h-32"
                                value={formData.checkInInstructions}
                                onChange={e => updateData({ checkInInstructions: e.target.value })}
                                placeholder="e.g. Code is 1234, keypad on front door..."
                            />
                        </div>
                    </div>
                );
            case 6: // AI Context
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Additional Property Details (for AI & Guests)
                            </label>
                            <p className="text-sm text-gray-500 mb-3">
                                Add any extra information about your property that guests often ask about or that doesn’t fit into other fields. This will be used by the AI co-host to answer guest questions more accurately.
                            </p>
                            <textarea
                                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none h-48"
                                value={formData.aiNotes}
                                onChange={e => updateData({ aiNotes: e.target.value })}
                                placeholder="e.g. The pool is heated to 80 degrees. Trash is collected on Tuesdays. The nearest grocery store is 5 minutes away..."
                            />
                        </div>
                    </div>
                );
            case 7: // Review
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Review Details</h3>

                            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 text-sm">
                                <div><dt className="text-gray-500">Name</dt><dd className="font-medium">{formData.name}</dd></div>
                                <div><dt className="text-gray-500">Type</dt><dd className="font-medium">{formData.propertyType}</dd></div>
                                <div><dt className="text-gray-500">Location</dt><dd className="font-medium">{[formData.streetAddress, formData.city, formData.state].filter(Boolean).join(', ') || '-'}</dd></div>
                                <div><dt className="text-gray-500">Capacity</dt><dd className="font-medium">{formData.maxGuests} Guests • {formData.bedrooms} BR • {formData.beds} Beds</dd></div>
                                <div><dt className="text-gray-500">Amenities</dt><dd className="font-medium">{formData.amenities.length} selected</dd></div>
                                <div><dt className="text-gray-500">Check-in</dt><dd className="font-medium">
                                    {(() => {
                                        const [h, m] = formData.checkInTime.split(':').map(Number);
                                        const period = h >= 12 ? 'PM' : 'AM';
                                        const h12 = h % 12 || 12;
                                        return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
                                    })()}
                                </dd></div>
                                <div><dt className="text-gray-500">Check-out</dt><dd className="font-medium">
                                    {(() => {
                                        const [h, m] = formData.checkOutTime.split(':').map(Number);
                                        const period = h >= 12 ? 'PM' : 'AM';
                                        const h12 = h % 12 || 12;
                                        return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
                                    })()}
                                </dd></div>
                                {formData.aiNotes && (
                                    <div className="col-span-1 md:col-span-2 border-t pt-3 mt-1">
                                        <dt className="text-gray-500">Additional Details</dt>
                                        <dd className="font-medium text-gray-700 mt-1">{formData.aiNotes}</dd>
                                    </div>
                                )}
                            </dl>
                        </div>

                        <p className="text-sm text-gray-500 text-center">
                            By clicking Create Property, you acknowledge this listing will be added to your CoHost workspace.
                        </p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-white">
            {/* Wizard Header */}
            <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
                <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/cohost/properties" className="text-gray-400 hover:text-gray-600">
                            <span className="sr-only">Exit</span>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </Link>
                        <div className="h-6 w-px bg-gray-200"></div>
                        <span className="font-semibold text-gray-900">Add Property</span>
                    </div>
                    <div className="text-sm font-medium text-gray-500">
                        Step {currentStep + 1} of {STEPS.length}
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="h-1 bg-gray-100 w-full">
                    <div
                        className="h-full bg-blue-600 transition-all duration-300 ease-in-out"
                        style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
                    />
                </div>
            </header>

            <div className="max-w-3xl mx-auto px-4 py-8 pb-32">
                {importUrl && currentStep === 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8 flex items-start gap-3">
                        <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <p className="text-sm text-blue-800 font-medium">Import Mode (Preview)</p>
                            <p className="text-sm text-blue-600 mt-1">
                                We see you want to import from <strong>{importUrl}</strong>. For now, please complete the wizard manually. Auto-fill coming soon!
                            </p>
                        </div>
                    </div>
                )}

                <h1 className="text-2xl font-bold text-gray-900 mb-8">{STEPS[currentStep].title}</h1>

                {renderStep()}
            </div>

            {/* Footer Navigation */}
            <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <button
                        onClick={handleBack}
                        className="px-6 py-2.5 text-gray-700 font-medium hover:bg-gray-50 rounded-lg transition-colors underline decoration-transparent hover:decoration-gray-300"
                    >
                        {currentStep === 0 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                        onClick={handleNext}
                        disabled={loading}
                        className="px-8 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-black transition-colors disabled:opacity-70 flex items-center gap-2"
                    >
                        {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {currentStep === STEPS.length - 1 ? 'Create Property' : 'Next'}
                    </button>
                </div>
            </footer>
        </div>
    );
}
