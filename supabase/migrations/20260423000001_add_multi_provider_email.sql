-- Migration: Add multi-provider email support to connections
-- Adds Microsoft OAuth and SMTP/app-password fields so hosts can connect
-- Outlook, Yahoo, iCloud, or any SMTP provider for both ingest and reply.
--
-- email_provider defaults to 'gmail' so all existing rows are unchanged.

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS email_provider TEXT NOT NULL DEFAULT 'gmail';
  -- 'gmail' | 'microsoft' | 'smtp'

-- Microsoft OAuth fields
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS microsoft_refresh_token    TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_token_expires_at BIGINT,
  ADD COLUMN IF NOT EXISTS microsoft_account_email    TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_status           TEXT;
  -- 'connected' | 'error' | 'needs_reconnect'

-- SMTP / app-password fields (send-only; IMAP receive is phase-2)
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS smtp_host               TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port               INTEGER,
  ADD COLUMN IF NOT EXISTS smtp_user               TEXT,
  ADD COLUMN IF NOT EXISTS smtp_password_encrypted TEXT,  -- AES-256-GCM, format: iv:authTag:ciphertext (base64 parts)
  ADD COLUMN IF NOT EXISTS smtp_secure             BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS smtp_provider           TEXT,
  -- 'yahoo' | 'icloud' | 'zoho' | 'custom'
  ADD COLUMN IF NOT EXISTS smtp_from_name          TEXT,  -- display name in From header
  ADD COLUMN IF NOT EXISTS smtp_status             TEXT;
  -- 'connected' | 'error'

-- Constraint: email_provider must be a known value
ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_email_provider_check;

ALTER TABLE connections
  ADD CONSTRAINT connections_email_provider_check
    CHECK (email_provider IN ('gmail', 'microsoft', 'smtp'));
