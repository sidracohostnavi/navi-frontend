-- Migration: Update connections platform check constraint
-- Description: Adds 'booking' and 'pms' to the allowed values for the platform column.

BEGIN;

-- Drop old constraint
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_platform_check;

-- Add new constraint
ALTER TABLE connections 
ADD CONSTRAINT connections_platform_check 
CHECK (platform IN ('airbnb', 'vrbo', 'booking', 'pms'));

COMMIT;
