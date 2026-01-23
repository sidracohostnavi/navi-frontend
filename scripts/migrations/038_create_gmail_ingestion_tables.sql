-- Create gmail_messages table
CREATE TABLE IF NOT EXISTS public.gmail_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL,
    subject TEXT,
    snippet TEXT,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure unique Gmail message per connection to avoid duplicates
    CONSTRAINT unique_gmail_message_per_connection UNIQUE (connection_id, gmail_message_id)
);

-- Enable RLS
ALTER TABLE public.gmail_messages ENABLE ROW LEVEL SECURITY;

-- Create policies (mimicking connections policies)

-- Drop policies if they exist to ensure idempotency
DROP POLICY IF EXISTS "Users can view their own gmail messages" ON public.gmail_messages;
DROP POLICY IF EXISTS "Users can insert their own gmail messages" ON public.gmail_messages;

-- Allow users to view messages for connections they have access to
CREATE POLICY "Users can view their own gmail messages"
    ON public.gmail_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.id = gmail_messages.connection_id
            AND c.user_id = auth.uid()
        )
    );

-- Allow insert/update for own connections
CREATE POLICY "Users can insert their own gmail messages"
    ON public.gmail_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.id = gmail_messages.connection_id
            AND c.user_id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gmail_messages_connection_id ON public.gmail_messages(connection_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_gmail_id ON public.gmail_messages(gmail_message_id);

-- Also create reservation_facts table if it doesn't exist, as it's used in the next step of processing
CREATE TABLE IF NOT EXISTS public.reservation_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    source_gmail_message_id TEXT, -- Not a direct FK to gmail_messages.id to keep it loose, but refers to google's ID
    
    check_in DATE,
    check_out DATE,
    guest_name TEXT,
    guest_count INTEGER,
    confirmation_code TEXT,
    listing_name TEXT,
    confidence NUMERIC,
    raw_data JSONB,
    
    CONSTRAINT unique_reservation_fact UNIQUE (connection_id, source_gmail_message_id)
);

-- Enable RLS for reservation_facts
ALTER TABLE public.reservation_facts ENABLE ROW LEVEL SECURITY;

-- RLS for facts
DROP POLICY IF EXISTS "Users can view their own reservation facts" ON public.reservation_facts;
DROP POLICY IF EXISTS "Users can insert their own reservation facts" ON public.reservation_facts;

CREATE POLICY "Users can view their own reservation facts"
    ON public.reservation_facts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.id = reservation_facts.connection_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own reservation facts"
    ON public.reservation_facts
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.id = reservation_facts.connection_id
            AND c.user_id = auth.uid()
        )
    );
