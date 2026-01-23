-- Migration 037: Add Gmail Label Config Fields to Connections
-- Safe migration - only adds columns if missing

ALTER TABLE connections
ADD COLUMN IF NOT EXISTS gmail_label_name TEXT,
ADD COLUMN IF NOT EXISTS gmail_label_id TEXT,
ADD COLUMN IF NOT EXISTS platform_color TEXT;

-- Update existing connections to use reservation_label if set
UPDATE connections 
SET gmail_label_name = reservation_label 
WHERE gmail_label_name IS NULL AND reservation_label IS NOT NULL;
