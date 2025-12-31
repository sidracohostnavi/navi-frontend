// lib/hooks/useBookings.ts
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Booking, 
  CalendarEvent, 
  Property, 
  CleanerShare, 
  CHANNEL_COLORS 
} from '@/lib/supabase/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Hook for fetching host's properties
export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('properties')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;
      setProperties(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return { properties, loading, error, refresh: fetchProperties };
}

// Hook for fetching calendar events (formatted for FullCalendar)
export function useCalendarEvents(propertyId: string | null) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!propertyId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select('*')
        .eq('property_id', propertyId)
        .eq('status', 'confirmed')
        .gte('check_out', new Date().toISOString().split('T')[0]);

      if (fetchError) throw fetchError;

      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', propertyId)
        .single();

      const calendarEvents: CalendarEvent[] = (data || []).map((booking) => ({
        id: booking.id,
        property_id: booking.property_id,
        property_name: property?.name || 'Property',
        title: formatEventTitle(booking.guest_name, booking.guest_count),
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
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refresh: fetchEvents };
}

// Hook for managing cleaner shares
export function useCleanerShares(propertyId: string | null) {
  const [shares, setShares] = useState<CleanerShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    if (!propertyId) {
      setShares([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('cleaner_shares')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setShares(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch shares');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  const createShare = useCallback(async (name?: string, expiresAt?: Date) => {
    if (!propertyId) return null;

    try {
      const { data, error: createError } = await supabase
        .from('cleaner_shares')
        .insert({
          property_id: propertyId,
          name: name || null,
          expires_at: expiresAt?.toISOString() || null,
        })
        .select()
        .single();

      if (createError) throw createError;
      
      await fetchShares();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share');
      return null;
    }
  }, [propertyId, fetchShares]);

  const deactivateShare = useCallback(async (shareId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('cleaner_shares')
        .update({ is_active: false })
        .eq('id', shareId);

      if (updateError) throw updateError;
      await fetchShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate share');
    }
  }, [fetchShares]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  return { shares, loading, error, createShare, deactivateShare, refresh: fetchShares };
}

// Helper function
function formatEventTitle(guestName?: string | null, guestCount?: number | null): string {
  const name = guestName || 'Guest';
  const count = guestCount ? ` (${guestCount} guests)` : '';
  return `${name}${count}`;
}