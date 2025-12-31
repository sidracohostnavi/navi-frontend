// app/calendar/page.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventClickArg } from '@fullcalendar/core';
import { 
  useProperties, 
  useCalendarEvents, 
  useCleanerShares 
} from '@/lib/hooks/useBookings';
import { CHANNEL_LABELS, CalendarEvent } from '@/lib/supabase/types';
import BookingModal from '@/components/BookingModal';
import ShareModal from '@/components/ShareModal';
import PropertySelector from '@/components/PropertySelector';

export default function CalendarPage() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const { properties, loading: propertiesLoading } = useProperties();
  const { events, loading: eventsLoading, refresh: refreshEvents } = useCalendarEvents(selectedPropertyId);
  const { shares, createShare, deactivateShare } = useCleanerShares(selectedPropertyId);

  // Set default property when properties load
  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  const handleEventClick = (info: EventClickArg) => {
    const event = events.find(e => e.id === info.event.id);
    if (event) {
      setSelectedEvent(event);
    }
  };

  const handlePropertyChange = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setSelectedEvent(null);
  };

  const handleCreateShare = async (name: string, expiresAt?: Date) => {
    const share = await createShare(name, expiresAt);
    return share;
  };

  const loading = propertiesLoading || eventsLoading;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-semibold text-gray-900">Booking Calendar</h1>
          <PropertySelector
            properties={properties}
            selectedId={selectedPropertyId}
            onChange={handlePropertyChange}
            loading={propertiesLoading}
          />
        </div>
        <button 
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          onClick={() => setShowShareModal(true)}
          disabled={!selectedPropertyId}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Share with Cleaner
        </button>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl shadow-sm p-6 min-h-[600px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-96 text-gray-500">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-3" />
            <p>Loading calendar...</p>
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,dayGridWeek',
            }}
            events={events.map(e => ({
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              backgroundColor: e.color,
              borderColor: e.color,
            }))}
            eventClick={handleEventClick}
            eventDisplay="block"
            dayMaxEvents={3}
            height="auto"
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Channels</h3>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#FF5A5F]" />
            <span className="text-sm text-gray-600">Airbnb</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#3D5A80]" />
            <span className="text-sm text-gray-600">VRBO</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#003580]" />
            <span className="text-sm text-gray-600">Booking.com</span>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedEvent && (
        <BookingModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {showShareModal && selectedPropertyId && (
        <ShareModal
          propertyId={selectedPropertyId}
          shares={shares}
          onCreateShare={handleCreateShare}
          onDeactivateShare={deactivateShare}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}