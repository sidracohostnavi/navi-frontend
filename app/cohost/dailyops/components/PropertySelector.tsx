// components/PropertySelector.tsx
'use client';

import { Property } from '@/lib/supabase/types';

interface PropertySelectorProps {
  properties: Property[];
  selectedId: string | null;
  onChange: (propertyId: string) => void;
  loading?: boolean;
}

export default function PropertySelector({
  properties,
  selectedId,
  onChange,
  loading,
}: PropertySelectorProps) {
  if (loading) {
    return (
      <div className="w-[200px] h-10 bg-gray-200 rounded-lg animate-pulse" />
    );
  }

  if (properties.length === 0) {
    return (
      <div className="text-sm text-gray-500 px-4 py-2 bg-gray-50 rounded-lg">
        No properties found
      </div>
    );
  }

  return (
    <div className="relative flex items-center">
      <svg 
        className="absolute left-3 w-4 h-4 text-gray-500 pointer-events-none"
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      <select
        value={selectedId || ''}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-9 pr-9 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg cursor-pointer min-w-[200px] hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <option value="" disabled>
          Select a property
        </option>
        {properties.map((property) => (
          <option key={property.id} value={property.id}>
            {property.name}
          </option>
        ))}
      </select>
      <svg 
        className="absolute right-3 w-4 h-4 text-gray-500 pointer-events-none"
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}