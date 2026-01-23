-- Migration: Add street_address to cohost_properties
-- Description: Adds a TEXT column for storing the full street address to improve AI context and location accuracy.

ALTER TABLE cohost_properties 
ADD COLUMN IF NOT EXISTS street_address TEXT;
