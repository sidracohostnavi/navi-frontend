-- Migration: Add last_synced_at column to bookings table
-- Description: The sync API tries to insert last_synced_at but the column doesn't exist, causing all booking inserts to fail silently.

BEGIN;

-- Add the missing column
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Create an index for efficient queries
CREATE INDEX IF NOT EXISTS idx_bookings_last_synced ON bookings(last_synced_at);

COMMIT;
