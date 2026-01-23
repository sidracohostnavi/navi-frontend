-- Migration: Create ical_feeds table
-- Description: Stores inbound iCal feed configurations for properties
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Create table
-- ============================================

CREATE TABLE IF NOT EXISTS ical_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES cohost_properties(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL, -- e.g. "Airbnb", "VRBO"
  source_type TEXT NOT NULL, -- airbnb|vrbo|booking|direct|custom
  ical_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT, -- success|error
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. Create Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ical_feeds_property ON ical_feeds(property_id);
CREATE INDEX IF NOT EXISTS idx_ical_feeds_prop_type ON ical_feeds(property_id, source_type);
CREATE INDEX IF NOT EXISTS idx_ical_feeds_active ON ical_feeds(is_active);

-- ============================================
-- 3. Row Level Security (RLS)
-- ============================================

ALTER TABLE ical_feeds ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view/manage feeds if they belong to the workspace that owns the property
-- We link through cohost_properties -> workspace_id
-- cohost_properties must have RLS enabled (which it does per previous migrations)

CREATE POLICY "Users can view feeds for their properties"
  ON ical_feeds FOR SELECT
  USING (
    property_id IN (
      SELECT id FROM cohost_properties
      WHERE workspace_id IN (
        SELECT workspace_id FROM cohost_workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage feeds for their properties"
  ON ical_feeds FOR ALL
  USING (
    property_id IN (
      SELECT id FROM cohost_properties
      WHERE workspace_id IN (
        SELECT workspace_id FROM cohost_workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- 4. Grant Permissions
-- ============================================

GRANT ALL ON ical_feeds TO authenticated;
GRANT ALL ON ical_feeds TO service_role;
