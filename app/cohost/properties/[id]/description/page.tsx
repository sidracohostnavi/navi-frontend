'use client';

import React, { useState, useEffect, use } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const supabase = createClient();

    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [initialData, setInitialData] = useState<any>(null);

    const isDirty = initialData && JSON.stringify(property) !== JSON.stringify(initialData);

    useEffect(() => {
        async function fetchProperty() {
            try {
                const { data, error } = await supabase
                    .from('cohost_properties')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                if (data) {
                    setProperty(data);
                    setInitialData(data);
                }
            } catch (error) {
                console.error("Error fetching property:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchProperty();
    }, [id, supabase]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('cohost_properties')
                .update({
                    headline: property.headline,
                    description: property.description,
                    your_property: property.your_property,
                    guest_access: property.guest_access,
                    interaction_with_guests: property.interaction_with_guests,
                    other_details: property.other_details
                })
                .eq('id', id);

            if (error) throw error;
            setInitialData(property);
            alert('Listing content saved!');
        } catch (e: any) {
            alert('Error saving listing content: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading listing content...</div>;
    if (!property) return <div className="p-8 text-center text-gray-500">Property not found.</div>;

    const sections = [
        { id: 'description', label: 'Description', limit: 500, placeholder: 'Brief overview of your property...', rows: 3 },
        { id: 'your_property', label: 'Your Property', limit: 8000, placeholder: 'Detailed description of the space, rooms, and features...', rows: 8 },
        { id: 'guest_access', label: 'Guest Access', limit: 500, placeholder: 'What parts of the property can guests access?', rows: 3 },
        { id: 'interaction_with_guests', label: 'Interaction with Guests', limit: 500, placeholder: 'How available will you be during their stay?', rows: 3 },
        { id: 'other_details', label: 'Other Details To Note', limit: 2000, placeholder: 'Important information (e.g. noise, stairs, security cameras)...', rows: 4 }
    ];

    return (
        <main className="max-w-4xl mx-auto p-6 space-y-8 animate-fadeIn pb-32">
            <header>
                <h2 className="text-2xl font-bold text-gray-900">Description</h2>
                <p className="text-gray-500">Manage your property's public facing description and details.</p>
            </header>

            <section className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-8">
                {/* Headline Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-4">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900">Headline</h3>
                            <p className="text-sm text-gray-500">A catchy title for your listing (max 65 characters).</p>
                        </div>
                        <span className={`text-xs font-bold font-mono px-2 py-1 rounded ${(property.headline?.length || 0) > 65 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>
                            {property.headline?.length || 0} / 65
                        </span>
                    </div>
                    <input 
                        className={`w-full text-xl font-semibold bg-gray-50/30 rounded-xl border px-4 py-3 focus:ring-2 outline-none transition-all ${
                            (property.headline?.length || 0) > 65 
                            ? 'border-red-300 focus:ring-red-100' 
                            : 'border-gray-200 focus:ring-[#008080]/10 focus:border-[#008080]'
                        }`}
                        value={property.headline || ''} 
                        onChange={e => setProperty({ ...property, headline: e.target.value })} 
                        placeholder="e.g. Modern Studio in Downtown" 
                        maxLength={80} // Allow a bit over for visual feedback of error
                    />
                </div>

                {/* Content Sections */}
                <div className="space-y-8">
                    {sections.map((section) => (
                        <div key={section.id} className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="font-bold text-gray-900 flex items-center gap-2">
                                    {section.label}
                                </label>
                                <span className={`text-[10px] font-bold font-mono ${(property[section.id]?.length || 0) > section.limit ? 'text-red-500' : 'text-gray-400'}`}>
                                    {property[section.id]?.length || 0} / {section.limit.toLocaleString()}
                                </span>
                            </div>
                            <textarea 
                                className="w-full rounded-xl border-gray-200 border px-4 py-3 focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all whitespace-pre-wrap text-gray-700 leading-relaxed bg-gray-50/10 hover:bg-transparent"
                                style={{ minHeight: section.rows * 28 + 'px' }}
                                value={property[section.id] || ''} 
                                onChange={e => setProperty({ ...property, [section.id]: e.target.value })} 
                                placeholder={section.placeholder} 
                            />
                        </div>
                    ))}
                </div>
            </section>

            {/* Save FAB */}
            <div className="fixed bottom-8 right-8 z-50">
                <button
                    onClick={handleSave}
                    disabled={saving || !isDirty || (property.headline?.length || 0) > 65}
                    className={`px-10 py-4 font-bold rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed ${
                        isDirty && (property.headline?.length || 0) <= 65 
                        ? 'bg-[#008080] text-white hover:bg-[#006666]' 
                        : 'bg-gray-400 text-white'
                    }`}
                >
                    {saving && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 inline-block vertical-middle" />}
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </main>
    );
}
