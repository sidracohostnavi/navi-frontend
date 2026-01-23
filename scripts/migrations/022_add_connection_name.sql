-- Migration: Add name column to connections table
-- Description: Allows users to give a friendly nickname to their connection.

BEGIN;

ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS name TEXT;

COMMIT;
