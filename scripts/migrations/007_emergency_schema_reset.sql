-- Migration: Emergency Schema Reset
-- Description: Drops and recreates cohost_properties and bookings with the COMPLETE correct schema.
-- Run this to fix "column does not exist" or other corruption errors.

BEGIN;

-- 1. CLEANUP (Drop old/corrupted tables)
-- CASCADE will automatically drop the bookings table that references properties
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS cohost_properties CASCADE;


-- 2. CREATE COHOST_PROPERTIES (Full Schema)
CREATE TABLE cohost_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core Relations
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  
  -- Basic Info
  name TEXT NOT NULL,
  property_type TEXT, -- House, Apartment, etc.
  timezone TEXT DEFAULT 'UTC',
  
  -- Location
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  neighborhood TEXT,
  
  -- Appearance
  image_url TEXT,
  color TEXT DEFAULT '#3B82F6',

  -- Capacity
  max_guests INTEGER,
  bedrooms INTEGER,
  beds INTEGER,
  bathrooms NUMERIC,

  -- Details
  amenities TEXT[], -- Array of strings
  house_rules JSONB, -- { pets: bool, smoking: bool, notes: text }
  
  -- Access
  check_in_time TEXT,
  check_out_time TEXT,
  entry_method TEXT,
  check_in_instructions TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cohost_properties_workspace ON cohost_properties(workspace_id);

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


-- 3. CREATE BOOKINGS (Full Schema)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES cohost_properties(id) ON DELETE CASCADE,
  
  -- Guest Info
  guest_name TEXT NOT NULL,
  
  -- Schedule
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ NOT NULL,
  
  -- Status & $$
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled')),
  total_amount NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  
  -- Source tracking (added from 005)
  platform TEXT DEFAULT 'direct',
  source_type TEXT DEFAULT 'direct', -- normalized source
  external_uid TEXT, -- ID from Airbnb/VRBO
  raw_data JSONB, -- Full payload from iCal
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bookings_workspace_dates ON bookings(workspace_id, check_in);
CREATE INDEX idx_bookings_property_dates ON bookings(property_id, check_in);
CREATE UNIQUE INDEX idx_bookings_unique_external ON bookings(property_id, source_type, external_uid);

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

-- 4. GRANT PERMISSIONS
GRANT ALL ON cohost_properties TO authenticated;
GRANT ALL ON bookings TO authenticated;

COMMIT;
