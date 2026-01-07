// app/calendar/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { createClient } from '@supabase/supabase-js';
import { 
  CalendarEvent, 
  Property, 
  CleanerShare,
  CHANNEL_COLORS,
  CHANNEL_LABELS 
} from '@/lib/supabase/types';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CalendarPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shares, setShares] = useState<CleanerShare[]>([]);
  const [newShareName, setNewShareName] = useState('');
  const [expiresIn, setExpiresIn] = useState('never');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch properties
  useEffect(() => {
    async function fetchProperties() {
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .order('name');
        
        if (error) throw error;
        setProperties(data || []);
        if (data && data.length > 0) {
          setSelectedPropertyId(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching properties:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProperties();
  }, []);

  // Fetch events when property changes
  useEffect(() => {
    async function fetchEvents() {
      if (!selectedPropertyId) {
        setEvents([]);
        return;
      }

      try {
        setLoading(true);
        const { data: bookings, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('property_id', selectedPropertyId)
          .eq('status', 'confirmed')
          .gte('check_out', new Date().toISOString().split('T')[0]);

        if (error) throw error;

        const { data: property } = await supabase
          .from('properties')
          .select('name')
          .eq('id', selectedPropertyId)
          .single();

        const calendarEvents: CalendarEvent[] = (bookings || []).map((booking) => ({
          id: booking.id,
          property_id: booking.property_id,
          property_name: property?.name || 'Property',
          title: booking.guest_name 
            ? `${booking.guest_name}${booking.guest_count ? ` (${booking.guest_count})` : ''}`
            : `Guest${booking.guest_count ? ` (${booking.guest_count})` : ''}`,
          start: booking.check_in,
          end: booking.check_out,
          channel: booking.channel,
          guest_name: booking.guest_name,
          guest_count: booking.guest_count,
          status: booking.status,
          color: CHANNEL_COLORS[booking.channel] || '#6B7280',
        }));

        setEvents(calendarEvents);
      } catch (err) {
        console.error('Error fetching events:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, [selectedPropertyId]);

  // Fetch shares when property changes
  useEffect(() => {
    async function fetchShares() {
      if (!selectedPropertyId) {
        setShares([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('cleaner_shares')
          .select('*')
          .eq('property_id', selectedPropertyId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setShares(data || []);
      } catch (err) {
        console.error('Error fetching shares:', err);
      }
    }
    fetchShares();
  }, [selectedPropertyId]);

  const handleEventClick = (info: { event: { id: string } }) => {
    const event = events.find(e => e.id === info.event.id);
    if (event) setSelectedEvent(event);
  };

  const handleCreateShare = async () => {
    if (!selectedPropertyId) return;
    setCreating(true);

    try {
      let expiresAt: string | null = null;
      if (expiresIn !== 'never') {
        const date = new Date();
        date.setDate(date.getDate() + parseInt(expiresIn));
        expiresAt = date.toISOString();
      }

      const { error } = await supabase
        .from('cleaner_shares')
        .insert({
          property_id: selectedPropertyId,
          name: newShareName || 'Cleaner',
          expires_at: expiresAt,
        });

      if (error) throw error;

      // Refresh shares
      const { data } = await supabase
        .from('cleaner_shares')
        .select('*')
        .eq('property_id', selectedPropertyId)
        .order('created_at', { ascending: false });

      setShares(data || []);
      setNewShareName('');
      setExpiresIn('never');
    } catch (err) {
      console.error('Error creating share:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async (token: string, shareId: string) => {
    const shareUrl = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeactivateShare = async (shareId: string) => {
    if (!confirm('Revoke this share link?')) return;

    try {
      const { error } = await supabase
        .from('cleaner_shares')
        .update({ is_active: false })
        .eq('id', shareId);

      if (error) throw error;

      setShares(shares.map(s => 
        s.id === shareId ? { ...s, is_active: false } : s
      ));
    } catch (err) {
      console.error('Error deactivating share:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const activeShares = shares.filter(s => s.is_active);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-semibold text-gray-900">Booking Calendar</h1>
          
          {/* Property Selector */}
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
              value={selectedPropertyId || ''}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="appearance-none pl-9 pr-9 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg cursor-pointer min-w-[200px] hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="" disabled>Select a property</option>
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
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-3" />
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

      {/* Booking Modal */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-md w-full relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1"
              onClick={() => setSelectedEvent(null)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="flex gap-2 mb-4">
              <span 
                className="text-xs font-semibold text-white px-2.5 py-1 rounded uppercase tracking-wide"
                style={{ backgroundColor: CHANNEL_COLORS[selectedEvent.channel] }}
              >
                {CHANNEL_LABELS[selectedEvent.channel]}
              </span>
              <span className={`text-xs font-medium px-2.5 py-1 rounded capitalize ${
                selectedEvent.status === 'confirmed' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {selectedEvent.status}
              </span>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              {selectedEvent.guest_name || 'Guest'}
            </h2>
            
            {selectedEvent.guest_count && (
              <p className="text-sm text-gray-500 mb-6">
                {selectedEvent.guest_count} guests
              </p>
            )}

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between">
                <div>
                  <span className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Check-in</span>
                  <span className="text-sm font-medium text-gray-800">{formatDate(selectedEvent.start)}</span>
                </div>
                <div className="text-right">
                  <span className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Check-out</span>
                  <span className="text-sm font-medium text-gray-800">{formatDate(selectedEvent.end)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-200">
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                {selectedEvent.property_name}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && selectedPropertyId && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowShareModal(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1"
              onClick={() => setShowShareModal(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">Share with Cleaner</h2>
            <p className="text-sm text-gray-500 mb-6">
              Create a link for your cleaner to view booking dates and guest counts (no names).
            </p>

            {/* Create new share */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
                Create New Link
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr,140px] gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., Maria's Cleaning"
                    value={newShareName}
                    onChange={(e) => setNewShareName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expires</label>
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="never">Never</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
              </div>
              <button 
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={handleCreateShare}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Share Link'}
              </button>
            </div>

            {/* Active shares */}
            {activeShares.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
                  Active Links
                </h3>
                <div className="space-y-3">
                  {activeShares.map((share) => (
                    <div key={share.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{share.name || 'Unnamed'}</p>
                        <p className="text-xs text-gray-500">
                          Created {formatShortDate(share.created_at)}
                          {share.expires_at && ` · Expires ${formatShortDate(share.expires_at)}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 transition-colors"
                          onClick={() => handleCopyLink(share.token, share.id)}
                        >
                          {copiedId === share.id ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                        <button
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                          onClick={() => handleDeactivateShare(share.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}