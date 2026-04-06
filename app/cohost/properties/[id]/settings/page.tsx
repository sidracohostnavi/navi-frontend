'use client';

import React, { useState, useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AMENITIES_LIST, PROPERTY_TYPES } from '../../constants';

// --- Helpers ---
const to12h = (time24: string) => {
    if (!time24) return { time: "3:00", ampm: "PM" };
    const [h, m] = time24.split(':').map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return { time: `${h12}:${m.toString().padStart(2, '0')}`, ampm };
};

const to24h = (time12: string, ampm: string) => {
    let [h, m] = time12.split(':').map(Number);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const TIME_OPTIONS_12H = ["12:00", "1:00", "2:00", "3:00", "4:00", "5:00", "6:00", "7:00", "8:00", "9:00", "10:00", "11:00"];
const ROOM_TYPES = ['Bedroom', 'Living room', 'Bathroom', 'Kitchen'];
const BED_TYPES = ['King', 'Queen', 'Double', 'Single', 'Sofa bed', 'Bunk bed', 'Crib'];

// --- Sub-components ---

function RoomCard({ room, index, property, setProperty }: { room: any, index: number, property: any, setProperty: any }) {
    const [isCollapsed, setIsCollapsed] = useState(room.isCollapsed !== false);

    const updateRoom = (updates: any) => {
        const updatedRooms = [...property.rooms];
        updatedRooms[index] = { ...room, ...updates };
        setProperty({ ...property, rooms: updatedRooms });
    };

    return (
        <div className="bg-gray-50 rounded-2xl border border-gray-100 relative group shadow-sm transition-all hover:shadow-md overflow-hidden">
            {/* Header / Summary row */}
            <div 
                className="p-4 md:p-6 flex items-center justify-between cursor-pointer hover:bg-gray-100/50 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-4 flex-1">
                    <div className="bg-[#008080]/10 p-2 rounded-lg">
                        <svg className={`w-5 h-5 text-[#008080] transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-gray-900">{room.name || `Room ${index + 1}`}</span>
                            <span className="text-[10px] uppercase tracking-wider bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">{room.type}</span>
                        </div>
                        {isCollapsed && (room.type === 'Bedroom' || room.type === 'Living room') && (
                            <p className="text-xs text-gray-500 mt-1">
                                {room.beds || 0} {room.beds === 1 ? 'Bed' : 'Beds'} • {
                                    (room.bedTypes || []).length > 0 ? (
                                        room.bedTypes.join(' & ')
                                    ) : 'No beds'
                                } • {(room.amenities || []).length} Amenities
                            </p>
                        )}
                        {isCollapsed && (room.type === 'Bathroom' || room.type === 'Kitchen') && (
                            <p className="text-xs text-gray-500 mt-1">{(room.amenities || []).length} Amenities</p>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => {
                            const updated = (property.rooms || []).filter((_: any, i: number) => i !== index);
                            setProperty({ ...property, rooms: updated });
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove Room"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            {/* Expanded Content */}
            {!isCollapsed && (
                <div className="p-6 pt-0 space-y-6 border-t border-dashed border-gray-200 mt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Room Name</label>
                                <input 
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all shadow-sm"
                                    placeholder="e.g. Master Bedroom"
                                    value={room.name || ''}
                                    onChange={e => updateRoom({ name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Room Type</label>
                                <select 
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all shadow-sm"
                                    value={room.type}
                                    onChange={e => updateRoom({ type: e.target.value })}
                                >
                                    {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Beds Section - Reverted to Dropdowns */}
                        {(room.type === 'Bedroom' || room.type === 'Living room') && (
                            <div className="bg-white/50 p-4 rounded-xl border border-gray-100 shadow-inner space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Number of Beds</label>
                                    <input 
                                        type="number" min="0"
                                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all shadow-sm" 
                                        value={room.beds || 0} 
                                        onChange={e => {
                                            const count = parseInt(e.target.value) || 0;
                                            const currentTypes = room.bedTypes || [];
                                            const newTypes = Array.from({ length: count }, (_, i) => currentTypes[i] || 'Queen');
                                            updateRoom({ beds: count, bedTypes: newTypes, bedType: newTypes[0] || 'Queen' });
                                        }} 
                                    />
                                </div>
                                <div className="space-y-2">
                                    {(room.bedTypes || []).map((type: string, bedIdx: number) => (
                                        <div key={bedIdx} className="flex items-center gap-3 animate-fadeIn">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase w-12 shrink-0">Bed {bedIdx + 1}</label>
                                            <select 
                                                className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all shadow-sm"
                                                value={type}
                                                onChange={e => {
                                                    const newTypes = [...room.bedTypes];
                                                    newTypes[bedIdx] = e.target.value;
                                                    updateRoom({ bedTypes: newTypes, bedType: newTypes[0] });
                                                }}
                                            >
                                                {BED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Room Specific Amenities */}
                    <div className="border-t border-gray-100 pt-5">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1">Room Amenities</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                            {(room.type === 'Bedroom' ? AMENITIES_LIST['Bedroom'] : 
                            room.type === 'Bathroom' ? AMENITIES_LIST['Bathroom'] :
                            room.type === 'Kitchen' ? AMENITIES_LIST['Kitchen & Dining'] : []).map((amenity: string) => (
                                <label key={amenity} className="flex items-center gap-3 text-sm text-gray-600 hover:text-gray-900 cursor-pointer transition-all group/amenity bg-white p-2 rounded-lg border border-transparent hover:border-gray-100 hover:shadow-sm">
                                    <input 
                                        type="checkbox" 
                                        checked={(room.amenities || []).includes(amenity)}
                                        onChange={() => {
                                            const current = room.amenities || [];
                                            const updatedAmenities = current.includes(amenity)
                                                ? current.filter((a: string) => a !== amenity)
                                                : [...current, amenity];
                                            updateRoom({ amenities: updatedAmenities });
                                        }}
                                        className="w-4 h-4 text-[#008080] rounded border-gray-200 focus:ring-[#008080]/20 cursor-pointer"
                                    />
                                    <span className="font-medium group-hover/amenity:translate-x-0.5 transition-transform">{amenity}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Main Page Component ---

export default function PropertySettingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const supabase = createClient();

    // Data State
    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAmenitiesExpanded, setIsAmenitiesExpanded] = useState(false);
    const [initialData, setInitialData] = useState<any>(null);
    const isDirty = initialData && JSON.stringify(property) !== JSON.stringify(initialData);
    
    // Policies state
    const [policies, setPolicies] = useState<any[]>([]);

    useEffect(() => {
        async function fetchData() {
            try {
                const { data, error } = await supabase
                    .from('cohost_properties')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                if (data) {
                    // Initialize rooms with collapse state
                    const roomsWithSettings = (data.rooms || []).map((r: any) => ({ 
                        ...r, 
                        isCollapsed: true 
                    }));
                    const propertyWithRooms = { ...data, rooms: roomsWithSettings };
                    setProperty(propertyWithRooms);
                    setInitialData(propertyWithRooms);
                }

                const polRes = await fetch('/api/cohost/policies');
                if (polRes.ok) {
                    const polData = await polRes.json();
                    setPolicies(polData);
                }
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [id, supabase]);

    const handleUpdate = async (updates: any) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('cohost_properties')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            const updated = { ...property, ...updates };
            setProperty(updated);
            setInitialData(updated);
            alert('Changes saved!');
        } catch (e: any) {
            alert('Error updating: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleMainAmenity = (amenity: string) => {
        const current = property.amenities || [];
        const exists = current.includes(amenity);
        const updated = exists
            ? current.filter((a: string) => a !== amenity)
            : [...current, amenity];
        setProperty({ ...property, amenities: updated });
    };

    const updateRules = (ruleUpdates: any) => {
        const currentRules = property.house_rules || {};
        const updatedRules = { ...currentRules, ...ruleUpdates };
        setProperty((prev: any) => ({ ...prev, house_rules: updatedRules }));
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="w-12 h-12 border-4 border-[#008080]/10 border-t-[#008080] rounded-full animate-spin" />
            <p className="text-gray-500 font-medium animate-pulse">Loading property settings...</p>
        </div>
    );
    if (!property) return <div className="p-8 text-center text-gray-500">Property not found.</div>;

    return (
        <main className="max-w-4xl mx-auto p-6 pb-32 space-y-8 animate-fadeIn">

            {/* Basic Info */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Basic Info</h3>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Property Name</label>
                        <input 
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all" 
                            value={property.name} 
                            onChange={e => setProperty({ ...property, name: e.target.value })} 
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Property Type</label>
                            <select 
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all" 
                                value={property.property_type} 
                                onChange={e => setProperty({ ...property, property_type: e.target.value })}
                            >
                                {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Timezone</label>
                            <select 
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-[#008080]/10 focus:border-[#008080] outline-none transition-all" 
                                value={property.timezone} 
                                onChange={e => setProperty({ ...property, timezone: e.target.value })}
                            >
                                {Intl.supportedValuesOf('timeZone').map(tz => <option key={tz}>{tz}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            {/* Location */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Location</h3>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Street Address</label>
                        <input className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm outline-none transition-all" value={property.street_address || ''} onChange={e => setProperty({ ...property, street_address: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
                            <input className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm outline-none transition-all" value={property.city || ''} onChange={e => setProperty({ ...property, city: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
                            <input className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm outline-none transition-all" value={property.state || ''} onChange={e => setProperty({ ...property, state: e.target.value })} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Country</label>
                            <input className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm outline-none transition-all" value={property.country || ''} onChange={e => setProperty({ ...property, country: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Neighborhood</label>
                            <input className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm outline-none transition-all" value={property.neighborhood || ''} onChange={e => setProperty({ ...property, neighborhood: e.target.value })} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Capacity & Rooms */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Capacity & Rooms</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
                        <input type="number" className="w-full rounded-xl border-gray-200 border px-4 py-2.5 text-sm" value={property.max_guests || 0} onChange={e => setProperty({ ...property, max_guests: parseInt(e.target.value) })} />
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest opacity-70">Rooms & Layout</h4>
                        <button 
                            onClick={() => {
                                const newRoom = { 
                                    id: Date.now(), 
                                    type: 'Bedroom', 
                                    beds: 1, 
                                    bedTypes: ['Queen'], 
                                    amenities: [], 
                                    isCollapsed: false 
                                };
                                setProperty({ ...property, rooms: [...(property.rooms || []), newRoom] });
                            }}
                            className="text-xs font-bold text-[#008080] hover:bg-[#008080]/5 px-3 py-1.5 rounded-full transition-all"
                        >
                            + Add Room
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {(property.rooms || []).map((room: any, idx: number) => (
                            <RoomCard 
                                key={room.id || idx} 
                                room={room} 
                                index={idx} 
                                property={property} 
                                setProperty={setProperty} 
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* Check-in & Entry */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Check-in & Entry</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Check-in Time</label>
                        <div className="flex gap-2">
                            <select 
                                className="flex-1 rounded-xl border-gray-200 border px-3 py-2.5 bg-gray-50 text-sm outline-none" 
                                value={to12h(property.check_in_time).time} 
                                onChange={e => {
                                    const { ampm } = to12h(property.check_in_time);
                                    setProperty({ ...property, check_in_time: to24h(e.target.value, ampm) });
                                }}
                            >
                                {TIME_OPTIONS_12H.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button 
                                onClick={() => {
                                    const { time, ampm } = to12h(property.check_in_time);
                                    setProperty({ ...property, check_in_time: to24h(time, ampm === 'AM' ? 'PM' : 'AM') });
                                }}
                                className="px-4 py-2.5 bg-gray-100 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors shadow-sm"
                            >
                                {to12h(property.check_in_time).ampm}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Check-out Time</label>
                        <div className="flex gap-2">
                            <select 
                                className="flex-1 rounded-xl border-gray-200 border px-3 py-2.5 bg-gray-50 text-sm outline-none" 
                                value={to12h(property.check_out_time).time} 
                                onChange={e => {
                                    const { ampm } = to12h(property.check_out_time);
                                    setProperty({ ...property, check_out_time: to24h(e.target.value, ampm) });
                                }}
                            >
                                {TIME_OPTIONS_12H.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button 
                                onClick={() => {
                                    const { time, ampm } = to12h(property.check_out_time);
                                    setProperty({ ...property, check_out_time: to24h(time, ampm === 'AM' ? 'PM' : 'AM') });
                                }}
                                className="px-4 py-2.5 bg-gray-100 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors shadow-sm"
                            >
                                {to12h(property.check_out_time).ampm}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Entry Method</label>
                        <select className="w-full rounded-xl border-gray-200 border px-4 py-2.5 bg-gray-50 text-sm outline-none transition-all" value={property.entry_method || 'Smart lock'} onChange={e => setProperty({ ...property, entry_method: e.target.value })}>
                            {['Smart lock', 'Lockbox', 'Keypad Lock', 'Key', 'In-person', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Check-in Instructions</label>
                    <textarea 
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm h-28 focus:ring-2 focus:ring-[#008080]/10 outline-none" 
                        value={property.check_in_instructions || ''} 
                        onChange={e => setProperty({ ...property, check_in_instructions: e.target.value })} 
                        placeholder="Provide details on how to access the property..." 
                    />
                </div>
            </section>

            {/* House Rules */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900">House Rules</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['petsAllowed', 'smokingAllowed', 'eventsAllowed', 'childrenAllowed', 'quietHours', 'idRequired'].map(key => (
                        <label key={key} className="flex items-center justify-between p-4 bg-gray-50/50 border border-gray-100 rounded-xl cursor-pointer hover:bg-white hover:shadow-sm transition-all group">
                            <span className="text-sm font-bold text-gray-700 tracking-tight">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={property.house_rules?.[key] || false} 
                                    onChange={e => updateRules({ [key]: e.target.checked })} 
                                    className="w-5 h-5 text-[#008080] rounded border-gray-300 focus:ring-[#008080]/20" 
                                />
                            </div>
                        </label>
                    ))}
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Additional Notes</label>
                    <textarea 
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm h-24 focus:ring-2 focus:ring-[#008080]/10 outline-none" 
                        value={property.house_rules?.notes || ''} 
                        onChange={e => updateRules({ notes: e.target.value })} 
                    />
                </div>
            </section>

            {/* Other Amenities */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsAmenitiesExpanded(!isAmenitiesExpanded)}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>
                        </div>
                        <h3 className="font-bold text-gray-900">General Amenities ({property.amenities?.length || 0})</h3>
                    </div>
                    <button className="text-gray-400 bg-gray-50 p-2 rounded-xl hover:bg-gray-100 transition-colors">
                        <svg className={`w-5 h-5 transition-transform duration-300 ${isAmenitiesExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                </div>
                {isAmenitiesExpanded && (
                    <div className="space-y-8 mt-8 border-t border-gray-100 pt-6 animate-fadeIn">
                        {Object.entries(AMENITIES_LIST)
                            .filter(([category]) => !['Bedroom', 'Bathroom', 'Kitchen & Dining'].includes(category))
                            .map(([category, items]) => (
                            <div key={category} className="space-y-4">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{category}</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {(items as string[]).map(amenity => (
                                        <label key={amenity} className="flex items-center gap-3 p-3 rounded-xl border border-gray-50 hover:border-[#008080]/10 hover:bg-[#008080]/5 transition-all cursor-pointer group">
                                            <input type="checkbox" checked={(property.amenities || []).includes(amenity)} onChange={() => toggleMainAmenity(amenity)} className="w-4 h-4 text-[#008080] rounded focus:ring-[#008080]/30 border-gray-300" />
                                            <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900">{amenity}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
            
            {/* Policies */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Rental Agreement & Policies</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Selected Policy</label>
                        <select 
                            value={property.policy_id || ''} 
                            onChange={e => setProperty({ ...property, policy_id: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#008080]/10 outline-none transition-all"
                        >
                            <option value="">Select a policy...</option>
                            {policies.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-2 ml-1">
                            Policies are managed in <Link href="/cohost/settings/policies" className="text-[#008080] font-bold hover:underline">Global Settings</Link>.
                        </p>
                    </div>
                </div>
            </section>

            {/* AI Notes */}
            <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="w-8 h-8 bg-[#008080]/5 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.989-2.386l-.548-.547z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900">AI Context</h3>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Internal Notes for AI</label>
                    <textarea 
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm h-32 focus:ring-2 focus:ring-[#008080]/10 outline-none" 
                        value={property.ai_notes || ''} 
                        onChange={e => setProperty({ ...property, ai_notes: e.target.value })} 
                        placeholder="Add specific details used by the AI to answer guest questions..."
                    />
                </div>
            </section>

            {/* Floating Save Button */}
            <div className="fixed bottom-8 left-0 right-0 pointer-events-none flex justify-center z-50">
                <div className="pointer-events-auto">
                    <button 
                        onClick={() => handleUpdate(property)} 
                        disabled={saving || !isDirty} 
                        className={`px-12 py-4 font-bold rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed flex items-center gap-3 ${
                            isDirty ? 'bg-[#008080] text-white hover:bg-[#006666]' : 'bg-gray-400 text-white'
                        }`}
                    >
                        {saving && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {saving ? 'Saving Changes...' : isDirty ? 'Save Changes' : 'All Changes Saved'}
                        {!saving && isDirty && (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </main>
    );
}
