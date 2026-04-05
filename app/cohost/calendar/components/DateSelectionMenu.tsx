'use client';

import { useEffect, useRef } from 'react';

interface DateSelectionMenuProps {
  x: number;
  y: number;
  propertyId: string;
  propertyName: string;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
  onCreateQuote: () => void;
  onCreateReservation: () => void;
  onCreateClosedPeriod: () => void;
}

export default function DateSelectionMenu({
  x,
  y,
  propertyName,
  startDate,
  endDate,
  onClose,
  onCreateQuote,
  onCreateReservation,
  onCreateClosedPeriod,
}: DateSelectionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  // Format dates
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 min-w-[250px]"
      style={{ left: x, top: y }}
    >
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-900">{propertyName}</p>
        <p className="text-xs text-gray-500">{formatDate(startDate)} → {formatDate(endDate)}</p>
      </div>
      
      {/* Options */}
      <div className="py-1">
        <button
          onClick={onCreateQuote}
          className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
        >
          <span className="text-lg">💰</span>
          <span className="text-sm font-medium text-gray-700">Create reservation with quote</span>
        </button>
        
        <button
          onClick={onCreateReservation}
          className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
        >
          <span className="text-lg">📝</span>
          <span className="text-sm font-medium text-gray-700">Create reservation without quote</span>
        </button>
        
        <button
          onClick={onCreateClosedPeriod}
          className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
        >
          <span className="text-lg">🚫</span>
          <span className="text-sm font-medium text-gray-700">Create closed period</span>
        </button>
      </div>
    </div>
  );
}
