-- Migration: Add guest_count and guest name parts to bookings
-- Description: Stores parsed guest details for display in the calendar.

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS guest_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS guest_first_name TEXT,
ADD COLUMN IF NOT EXISTS guest_last_initial TEXT;

-- Optional index if we query by name frequently (unlikely primarily)
-- CREATE INDEX IF NOT EXISTS idx_bookings_guest_name ON bookings(guest_name);
