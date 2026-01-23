-- Migration: Add ai_notes to cohost_properties
-- Description: Adds a TEXT column for storing additional property details for AI context.

ALTER TABLE cohost_properties 
ADD COLUMN IF NOT EXISTS ai_notes TEXT;
