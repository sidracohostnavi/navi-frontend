-- Migration 034: Gmail OAuth Tokens
-- Stores credentials for Gmail API access

ALTER TABLE connections
ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_access_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_token_expires_at BIGINT, -- Epoch ms
ADD COLUMN IF NOT EXISTS gmail_account_email TEXT,
ADD COLUMN IF NOT EXISTS gmail_scopes TEXT[],
ADD COLUMN IF NOT EXISTS gmail_connected_at TIMESTAMPTZ;

-- Security Note: In a real production app, apply strict RLS or column-level encryption for tokens.
-- For now, we rely on the existing "Users can view own connections" policy.
