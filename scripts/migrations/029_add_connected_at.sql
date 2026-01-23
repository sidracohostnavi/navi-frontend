-- Migration: Add connected_at to connections
-- Description: Adds a timestamp to track when a connection was established, for filtering historical data.

ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT now();

-- Backfill existing connections to use their created_at date (or now if null, though created_at should exist)
UPDATE connections 
SET connected_at = created_at 
WHERE connected_at IS NULL;
