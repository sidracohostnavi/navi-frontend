-- Add debug columns to ical_feeds for better sync troubleshooting
ALTER TABLE ical_feeds
ADD COLUMN IF NOT EXISTS last_http_status INTEGER,
ADD COLUMN IF NOT EXISTS last_content_type TEXT,
ADD COLUMN IF NOT EXISTS last_final_url TEXT,
ADD COLUMN IF NOT EXISTS last_event_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_response_snippet TEXT;

-- Update existing rows to have default 0 count
UPDATE ical_feeds SET last_event_count = 0 WHERE last_event_count IS NULL;
