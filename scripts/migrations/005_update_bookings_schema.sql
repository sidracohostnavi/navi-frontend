-- Migration: Update bookings schema for iCal sync
-- Description: Adds external_uid, source_type, and raw_data to bookings table
-- Run this in Supabase SQL Editor

-- 1. Add new columns
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS external_uid TEXT,
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'direct', -- e.g. airbnb, vrbo
ADD COLUMN IF NOT EXISTS raw_data JSONB,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 2. Create unique index for upserts
-- This ensures we don't duplicate bookings from the same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_external 
ON bookings(property_id, source_type, external_uid) 
WHERE external_uid IS NOT NULL;

-- 3. Update existing bookings if needed (optional backfill)
-- UPDATE bookings SET source_type = 'direct' WHERE source_type IS NULL;
