-- Migration 035: Gmail Status Columns

ALTER TABLE connections
ADD COLUMN IF NOT EXISTS gmail_status TEXT CHECK (gmail_status IN ('connected', 'error', 'pending')),
ADD COLUMN IF NOT EXISTS gmail_last_error_code TEXT,
ADD COLUMN IF NOT EXISTS gmail_last_error_message TEXT,
ADD COLUMN IF NOT EXISTS gmail_last_verified_at TIMESTAMPTZ;
