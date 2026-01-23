-- Migration: Enrichment Schema
-- Description: Adds tables for email processing duplication and logging, plus guest info columns to bookings.

BEGIN;

-- 1. Table to track processed emails to prevent duplicate parsing
CREATE TABLE IF NOT EXISTS processed_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, gmail_message_id)
);

-- 2. Table to log enrichment runs (manual or scheduled)
CREATE TABLE IF NOT EXISTS enrichment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE SET NULL, -- Keep logs even if connection deleted? Or CASCADE. Let's Set Null for history.
    run_type TEXT CHECK (run_type IN ('manual', 'scheduled')),
    status TEXT CHECK (status IN ('success', 'error', 'partial')),
    emails_processed INTEGER DEFAULT 0,
    bookings_updated INTEGER DEFAULT 0,
    details TEXT, -- Error message or summary
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add Guest Info columns to bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS guest_name TEXT,
ADD COLUMN IF NOT EXISTS guest_count INTEGER,
ADD COLUMN IF NOT EXISTS channel_logo TEXT, -- URL or identifier for logo
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- 4. RLS Policies (assuming RLS is enabled on bookings, enable for new tables)
ALTER TABLE processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_logs ENABLE ROW LEVEL SECURITY;

-- Simple policies for now (service role usually handles this, but for client access/viewing logs)
CREATE POLICY "Users can view their own connection logs" ON enrichment_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM connections c
            WHERE c.id = enrichment_logs.connection_id
            AND c.user_id = auth.uid()
        )
    );

-- Processed emails doesn't strictly need client access, but good practice
CREATE POLICY "Users can view processed emails for their connections" ON processed_emails
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM connections c
            WHERE c.id = processed_emails.connection_id
            AND c.user_id = auth.uid()
        )
    );

COMMIT;
