-- Migration: Add name column to ical_feeds
-- Description: Allows users to give a custom friendly name to a feed (e.g. "Airbnb Room 1")

ALTER TABLE ical_feeds 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Optional: Backfill name with source_name + ' ' + source_type for existing records if needed, 
-- or just leave null and fallback to source_name in logic.
-- Let's defaul it to source_name for now so it's not empty.
UPDATE ical_feeds SET name = source_name WHERE name IS NULL;
