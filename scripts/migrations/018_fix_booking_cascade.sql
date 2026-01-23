-- Migration: Change foreign key to ON DELETE CASCADE
-- Description: Ensures bookings are deleted when their source feed is deleted.

BEGIN;

-- Drop existing constraint if named or generic
-- We need to find the specific constraint name or recreate it.
-- Usually standard naming: bookings_source_feed_id_fkey

ALTER TABLE bookings 
DROP CONSTRAINT IF EXISTS bookings_source_feed_id_fkey;

ALTER TABLE bookings
ADD CONSTRAINT bookings_source_feed_id_fkey
FOREIGN KEY (source_feed_id)
REFERENCES ical_feeds(id)
ON DELETE CASCADE;

COMMIT;
