-- Migration: OTA tagging for ingested emails + per-OTA labels on connections
--
-- 1. gmail_messages.ota_source   — which OTA sent each email (auto-detected at ingest)
-- 2. connections.ota_labels      — user's custom label per OTA (e.g. {airbnb: "Airbnb"})
-- 3. connections.platform        — made nullable (being phased out; ota_platforms[] replaces it)

-- 1. Tag each ingested email with its OTA source
ALTER TABLE gmail_messages
  ADD COLUMN IF NOT EXISTS ota_source TEXT;
  -- Known values mirror OtaPlatform: 'airbnb' | 'vrbo' | 'booking_com' |
  -- 'lodgify' | 'hipcamp' | 'furnished_finder' | 'tripadvisor' | 'other'
  -- NULL = could not detect from sender (e.g. SMTP relay, unknown domain)

-- 2. Per-OTA label names per connection (user-editable)
--    Default: OTA display name (Airbnb, VRBO, etc.)
--    Custom:  whatever the host prefers ("My Airbnb", "Direct Guests")
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS ota_labels JSONB NOT NULL DEFAULT '{}';

-- 3. Phase out single-platform field — keep column but drop NOT NULL so new
--    connections don't need it. Existing rows are unaffected.
ALTER TABLE connections
  ALTER COLUMN platform DROP NOT NULL;
