'use client';

import React, { useState, useEffect, use } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const supabase = createClient();

    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [initialData, setInitialData] = useState<any>(null);
    const [saving, setSaving] = useState(false);

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
                    image_url: property.image_url,
                    listing_photos: property.listing_photos 
                })
                .eq('id', id);

            if (error) throw error;
            setInitialData(property);
            alert('Photos saved!');
        } catch (e: any) {
            alert('Error saving photos: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploading(true);
        const file = e.target.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${id}/${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        try {
            const { error: uploadError } = await supabase.storage
                .from('property-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('property-images')
                .getPublicUrl(filePath);

            setProperty((prev: any) => ({ ...prev, image_url: publicUrl }));
        } catch (error: any) {
            alert('Error uploading image: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading photos...</div>;
    if (!property) return <div className="p-8 text-center text-gray-500">Property not found.</div>;

    return (
        <main className="max-w-4xl mx-auto p-6 space-y-8 animate-fadeIn pb-32">
            <header>
                <h2 className="text-2xl font-bold text-gray-900">Photos</h2>
                <p className="text-gray-500">Manage your property's visual identity.</p>
            </header>

            {/* Main Property Image */}
            <section className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900">Main Property Photo</h3>
                        <p className="text-sm text-gray-500">This photo represents your property throughout the platform.</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="w-full md:w-64 aspect-square bg-gray-50 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 relative group flex items-center justify-center">
                        {property.image_url ? (
                            <>
                                <img src={property.image_url} alt="Property" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button 
                                        onClick={() => setProperty({ ...property, image_url: '' })}
                                        className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center p-6">
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <p className="text-xs text-gray-400 font-medium font-inter">No photo uploaded</p>
                            </div>
                        )}
                        {uploading && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center flex-col gap-2">
                                <div className="w-8 h-8 border-3 border-[#008080] border-t-transparent rounded-full animate-spin" />
                                <span className="text-[10px] font-bold text-[#008080] uppercase tracking-wider">Uploading...</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 space-y-4">
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                            <h4 className="text-sm font-semibold text-blue-900 mb-1 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Photo Guidelines
                            </h4>
                            <ul className="text-xs text-blue-800 space-y-1.5 list-disc list-inside opacity-80">
                                <li>Use high-resolution horizontal photos</li>
                                <li>Ensure the space is well-lit and clean</li>
                                <li>Show the entire exterior or main living area</li>
                                <li>Maximum file size: 5MB</li>
                            </ul>
                        </div>

                        <label className="inline-flex items-center gap-2.5 px-6 py-3 bg-[#008080] text-white text-sm font-bold rounded-xl hover:bg-[#006666] transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            {uploading ? 'Processing...' : 'Upload New Photo'}
                            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                        </label>
                    </div>
                </div>
            </section>

            {/* Save FAB */}
            <div className="fixed bottom-8 right-8 z-50">
                <button
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className={`px-10 py-4 font-bold rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed ${
                        isDirty ? 'bg-[#008080] text-white hover:bg-[#006666]' : 'bg-gray-400 text-white'
                    }`}
                >
                    {saving && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 inline-block vertical-middle" />}
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </main>
    );
}
