-- Add last_booking_count to ical_feeds to track actual DB bookings vs parsed events
ALTER TABLE ical_feeds
ADD COLUMN IF NOT EXISTS last_booking_count INTEGER DEFAULT 0;

-- Optional: Recalculate counts (requires complex update, maybe skip or do simple one)
-- UPDATE ical_feeds f SET last_booking_count = (SELECT count(*) FROM bookings b WHERE b.source_feed_id = f.id AND b.is_active = true);
