-- Migration: Add debug fields to ical_feeds
-- Description: Adds columns to store HTTP status, final URL, event count, and response snippets for debugging iCal syncs.

BEGIN;

ALTER TABLE ical_feeds 
ADD COLUMN IF NOT EXISTS last_http_status INTEGER,
ADD COLUMN IF NOT EXISTS last_final_url TEXT,
ADD COLUMN IF NOT EXISTS last_event_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_response_snippet TEXT;

COMMIT;
