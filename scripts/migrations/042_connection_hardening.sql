-- Migration: Connection Hardening
-- Description: Add archived_at for soft-delete support

BEGIN;

-- 1. Add archived_at column for soft-delete
ALTER TABLE connections
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2. Add index for efficient filtering of non-archived connections
CREATE INDEX IF NOT EXISTS idx_connections_archived_at 
ON connections (archived_at) 
WHERE archived_at IS NULL;

-- 3. Add comment for documentation
COMMENT ON COLUMN connections.archived_at IS 'When set, connection is soft-deleted. UI hides archived connections. Data (gmail_messages, review_items) remains intact.';

COMMIT;
