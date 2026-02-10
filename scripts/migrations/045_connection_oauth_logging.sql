-- Migration 045: Connection OAuth Logging + Color
-- Description: Add columns for OAuth health tracking and connection color

BEGIN;

-- 1. Add columns for OAuth health tracking
ALTER TABLE connections
ADD COLUMN IF NOT EXISTS gmail_last_success_at TIMESTAMPTZ;

-- 2. Add color column for visual identification (hex string like '#FF5733')
ALTER TABLE connections
ADD COLUMN IF NOT EXISTS color TEXT;

-- 3. Update gmail_status CHECK constraint to include 'needs_reconnect'
-- First drop the existing constraint if it exists
ALTER TABLE connections
DROP CONSTRAINT IF EXISTS connections_gmail_status_check;

-- Add the new constraint with 'needs_reconnect' status (allowing NULL for non-Gmail connections)
-- Also includes 'disconnected' for backwards compatibility with existing data
ALTER TABLE connections
ADD CONSTRAINT connections_gmail_status_check
CHECK (gmail_status IS NULL OR gmail_status IN ('connected', 'error', 'pending', 'needs_reconnect', 'disconnected'));

-- 4. Add helpful comments
COMMENT ON COLUMN connections.gmail_last_success_at IS 'Timestamp of last successful Gmail API call for this connection';
COMMENT ON COLUMN connections.color IS 'Hex color code for visual identification in UI (e.g. #FF5733)';

COMMIT;
