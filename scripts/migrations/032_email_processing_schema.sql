-- Migration 032: Email Processing Schema

-- 1. Store Raw Gmail Metadata (Deduplication Layer)
CREATE TABLE IF NOT EXISTS gmail_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gmail_message_id TEXT NOT NULL UNIQUE,
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
    subject TEXT,
    snippet TEXT,
    raw_metadata JSONB,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_messages_connection ON gmail_messages(connection_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_gmail_id ON gmail_messages(gmail_message_id);

-- 2. Store Extracted Reservation Facts
CREATE TABLE IF NOT EXISTS reservation_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_gmail_message_id TEXT REFERENCES gmail_messages(gmail_message_id) ON DELETE CASCADE,
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
    
    -- Extracted Fields
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guest_name TEXT,
    guest_count INTEGER,
    confirmation_code TEXT,
    listing_name TEXT,
    
    currency TEXT,
    total_payout NUMERIC,
    
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_facts_connection ON reservation_facts(connection_id);
CREATE INDEX IF NOT EXISTS idx_reservation_facts_confirmation ON reservation_facts(confirmation_code);

-- Enable RLS
ALTER TABLE gmail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_facts ENABLE ROW LEVEL SECURITY;

-- Policies (Allow all for service role, adjust for user access if needed)
CREATE POLICY "Allow authenticated read" ON gmail_messages 
    FOR SELECT TO authenticated USING (true);
    
CREATE POLICY "Allow authenticated insert" ON gmail_messages 
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated read" ON reservation_facts 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON reservation_facts 
    FOR INSERT TO authenticated WITH CHECK (true);
