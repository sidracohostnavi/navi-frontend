'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Check } from 'lucide-react';

type Props = {
    userId: string;
    userName: string;
    onClose: () => void;
};

export default function ManagePropertiesModal({ userId, userName, onClose }: Props) {
    const [properties, setProperties] = useState<any[]>([]);
    const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Use supabase client for fetching property list (RLS handles workspace scope)
    const supabase = createClient();

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                // 1. Fetch available properties in this workspace
                const { data: props, error } = await supabase
                    .from('cohost_properties')
                    .select('id, name')
                    .order('name');

                if (error) throw error;
                setProperties(props || []);

                // 2. Fetch currently assigned properties for this user
                // API infers workspace from session
                const res = await fetch(`/api/cohost/users/${userId}/properties`);
                if (res.ok) {
                    const data = await res.json();
                    setAssignedIds(new Set(data.propertyIds));
                }
            } catch (err) {
                console.error('Failed to load properties', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [userId, supabase]);

    const toggle = (id: string) => {
        const next = new Set(assignedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setAssignedIds(next);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/cohost/users/${userId}/properties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyIds: Array.from(assignedIds) })
            });
            if (!res.ok) throw new Error('Failed to save');
            onClose();
        } catch (err) {
            console.error(err);
            alert('Failed to save assignments');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-900">Manage Properties</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-2 bg-gray-50 border-b">
                    <p className="text-sm text-gray-600">
                        Select properties visible to <span className="font-semibold text-gray-900">{userName}</span>.
                        <br />
                        <span className="text-xs text-gray-500 italic">If no properties are selected, they will have access to <strong>ALL</strong> properties (default).</span>
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="py-8 text-center text-gray-500">Loading properties...</div>
                    ) : properties.length === 0 ? (
                        <div className="py-8 text-center text-gray-500">No properties found in this workspace.</div>
                    ) : (
                        properties.map(p => {
                            const isSelected = assignedIds.has(p.id);
                            return (
                                <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={isSelected}
                                        onChange={() => toggle(p.id)}
                                    />
                                    <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>{p.name}</span>
                                </label>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? 'Saving...' : 'Save Assignments'}
                    </button>
                </div>
            </div>
        </div>
    );
}
