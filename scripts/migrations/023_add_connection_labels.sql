-- Migration: Add label configuration columns to connections table
-- Description: Stores Gmail text labels for reservation parsing and messaging.

BEGIN;

ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS reservation_label TEXT,
ADD COLUMN IF NOT EXISTS message_label TEXT;

COMMIT;
