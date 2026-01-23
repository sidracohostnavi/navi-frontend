-- Run this migration in Supabase SQL Editor
-- Migration 036: Add unique constraint for booking upserts

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_dates
ON bookings(property_id, check_in, check_out)
WHERE check_in IS NOT NULL AND check_out IS NOT NULL;

-- Ensure guest_count column exists
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS guest_count INTEGER;
