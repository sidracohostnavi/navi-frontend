-- Migration: Create cohost_properties and bookings
-- Description: Core schema for CoHost property management and bookings
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Create cohost_properties
-- ============================================

CREATE TABLE IF NOT EXISTS cohost_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  image_url TEXT,
  color TEXT DEFAULT '#3B82F6', -- For calendar UI
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Self-healing: Ensure workspace_id exists
ALTER TABLE cohost_properties 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES cohost_workspaces(id) ON DELETE CASCADE;

-- Index for workspace lookups
CREATE INDEX IF NOT EXISTS idx_cohost_properties_workspace ON cohost_properties(workspace_id);

-- RLS
ALTER TABLE cohost_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view properties in their workspace"
  ON cohost_properties FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage properties in their workspace"
  ON cohost_properties FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );


-- ============================================
-- 2. Create bookings
-- ============================================

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE, -- Denormalized for efficient RLS
  property_id UUID NOT NULL REFERENCES cohost_properties(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled')),
  total_amount NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  platform TEXT DEFAULT 'direct', -- airbnb, vrbo, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_workspace_dates ON bookings(workspace_id, check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_property_dates ON bookings(property_id, check_in);

-- RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bookings in their workspace"
  ON bookings FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage bookings in their workspace"
  ON bookings FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 3. Grant Permissions
-- ============================================

GRANT ALL ON cohost_properties TO authenticated;
GRANT ALL ON bookings TO authenticated;
