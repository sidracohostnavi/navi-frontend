// components/BookingModal.tsx
'use client';

import { CalendarEvent, CHANNEL_LABELS, CHANNEL_COLORS } from '@/lib/supabase/types';

interface BookingModalProps {
  event: CalendarEvent;
  onClose: () => void;
}

export default function BookingModal({ event, onClose }: BookingModalProps) {
  const checkIn = new Date(event.start);
  const checkOut = new Date(event.end);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl p-6 max-w-md w-full relative shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1"
          onClick={onClose}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex gap-2 mb-4">
          <span 
            className="text-xs font-semibold text-white px-2.5 py-1 rounded uppercase tracking-wide"
            style={{ backgroundColor: CHANNEL_COLORS[event.channel] }}
          >
            {CHANNEL_LABELS[event.channel]}
          </span>
          <span 
            className={`text-xs font-medium px-2.5 py-1 rounded capitalize ${
              event.status === 'confirmed' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}
          >
            {event.status}
          </span>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          {event.guest_name || 'Guest'}
        </h2>
        
        {event.guest_count && (
          <p className="text-sm text-gray-500 mb-6">
            {event.guest_count} guests
          </p>
        )}

        <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1">
            <span className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              Check-in
            </span>
            <span className="text-sm font-medium text-gray-800">
              {formatDate(checkIn)}
            </span>
          </div>
          <div className="text-center px-2">
            <span className="text-xs text-gray-500">
              {nights} night{nights !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex-1 text-right">
            <span className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              Check-out
            </span>
            <span className="text-sm font-medium text-gray-800">
              {formatDate(checkOut)}
            </span>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-200">
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {event.property_name}
          </p>
        </div>
      </div>
    </div>
  );
}