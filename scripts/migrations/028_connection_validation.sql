-- Migration: Connection Validation
-- Description: Adds columns to store validation results and timestamp for connections.

ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS validation_results JSONB,
ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;
