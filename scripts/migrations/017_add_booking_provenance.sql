-- Migration: Add provenance tracking and active status to bookings
-- Description: Adds source_feed_id and is_active columns to support reconciliation and soft-deletes.

BEGIN;

-- 1. Add columns
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS source_feed_id UUID REFERENCES ical_feeds(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_source_feed ON bookings(source_feed_id);
CREATE INDEX IF NOT EXISTS idx_bookings_is_active ON bookings(is_active);

-- 3. Update existing bookings to be active (default is true, but good to be explicit for existing rows if needed, though DEFAULT handles new ones)
-- We can try to backfill source_feed_id if possible, but might be hard without data. 
-- For now, we leave source_feed_id null for existing rows.

COMMIT;
