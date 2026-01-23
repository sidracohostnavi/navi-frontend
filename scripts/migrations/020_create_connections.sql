-- Migration: Create connections and connection_properties tables
-- Description: Stores platform credential info (non-sensitive) and maps to properties.

BEGIN;

-- 1. Create connections table
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('airbnb', 'vrbo')),
    display_email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create join table
CREATE TABLE IF NOT EXISTS connection_properties (
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES cohost_properties(id) ON DELETE CASCADE,
    PRIMARY KEY (connection_id, property_id)
);

-- 3. Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_properties ENABLE ROW LEVEL SECURITY;

-- 4. Policies for connections
CREATE POLICY "Users can view own connections"
    ON connections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
    ON connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
    ON connections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
    ON connections FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Policies for connection_properties
-- Access depends on owning the connection
CREATE POLICY "Users can view connection properties"
    ON connection_properties FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM connections
            WHERE connections.id = connection_properties.connection_id
            AND connections.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage connection properties"
    ON connection_properties FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM connections
            WHERE connections.id = connection_properties.connection_id
            AND connections.user_id = auth.uid()
        )
    );

COMMIT;
