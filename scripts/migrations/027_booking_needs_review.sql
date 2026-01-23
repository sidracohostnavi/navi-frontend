-- Migration: Ensure needs_review column exists on bookings
-- Description: Adds needs_review column if it doesn't exist (it might have been added in 024)

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- Also ensure guest_count is present if not already
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_count INTEGER;

-- Also ensure guest_name is present if not already
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_name TEXT;
