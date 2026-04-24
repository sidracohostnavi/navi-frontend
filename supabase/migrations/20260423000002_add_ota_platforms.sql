-- Migration: Add OTA-centric platform filtering to connections
--
-- Replaces the manual Gmail label approach with a list of OTA platforms
-- per connection. The email ingest pipeline uses these to build sender-based
-- queries (from:@airbnb.com etc.) so hosts never need to create Gmail labels.
--
-- Transition: reservation_label is kept (nullable). Fetch logic falls back to
-- it for existing connections that haven't migrated to ota_platforms yet.

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS ota_platforms TEXT[] NOT NULL DEFAULT '{}';
  -- Known values: 'airbnb' | 'vrbo' | 'booking_com' | 'lodgify' |
  --               'hipcamp' | 'furnished_finder' | 'tripadvisor' | 'other'
  -- 'other' = custom senders defined in custom_sender_query

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS custom_sender_query TEXT;
  -- Optional free-form Gmail/Microsoft search fragment for unlisted platforms
  -- e.g. "from:@mypms.com" — appended to the OTA query with OR

-- Drop + re-add constraint so it's idempotent on re-run
ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_ota_platforms_check;

ALTER TABLE connections
  ADD CONSTRAINT connections_ota_platforms_check
    CHECK (
      ota_platforms <@ ARRAY[
        'airbnb', 'vrbo', 'booking_com', 'lodgify',
        'hipcamp', 'furnished_finder', 'tripadvisor', 'other'
      ]::TEXT[]
    );
