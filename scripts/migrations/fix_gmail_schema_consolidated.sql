-- Consolidated Migration for Gmail Integration
-- combine 034 (tokens) and 035 (status)

-- 1. OAuth Tokens
ALTER TABLE connections
ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_access_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_token_expires_at BIGINT, -- Epoch ms
ADD COLUMN IF NOT EXISTS gmail_account_email TEXT,
ADD COLUMN IF NOT EXISTS gmail_scopes TEXT[],
ADD COLUMN IF NOT EXISTS gmail_connected_at TIMESTAMPTZ;

-- 2. connection status
ALTER TABLE connections
ADD COLUMN IF NOT EXISTS gmail_status TEXT CHECK (gmail_status IN ('connected', 'error', 'pending')),
ADD COLUMN IF NOT EXISTS gmail_last_error_code TEXT,
ADD COLUMN IF NOT EXISTS gmail_last_error_message TEXT,
ADD COLUMN IF NOT EXISTS gmail_last_verified_at TIMESTAMPTZ;

-- 3. Security Note
-- Ensure RLS allows users to see these columns (default '*' select covers it if RLS allows the row).
