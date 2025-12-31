// lib/supabase/types.ts

// Types for calendar system
export interface Property {
  id: string;
  user_id: string;
  name: string;
  address?: string;
  ical_airbnb?: string;
  ical_vrbo?: string;
  ical_booking?: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  property_id: string;
  external_uid: string;
  channel: 'airbnb' | 'vrbo' | 'booking';
  check_in: string;
  check_out: string;
  guest_name?: string;
  guest_count?: number;
  status: 'confirmed' | 'cancelled';
  ical_summary?: string;
  ical_description?: string;
  enriched_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CleanerShare {
  id: string;
  property_id: string;
  token: string;
  name?: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  last_accessed_at?: string;
}

export interface CalendarEvent {
  id: string;
  property_id: string;
  property_name: string;
  title: string;
  start: string;
  end: string;
  channel: 'airbnb' | 'vrbo' | 'booking';
  guest_name?: string;
  guest_count?: number;
  status: 'confirmed' | 'cancelled';
  color: string;
}

// Channel colors for the calendar
export const CHANNEL_COLORS: Record<string, string> = {
  airbnb: '#FF5A5F',
  vrbo: '#3D5A80',
  booking: '#003580',
};

export const CHANNEL_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  vrbo: 'VRBO',
  booking: 'Booking.com',
};