-- Migration: Fix Global RLS Policies
-- Description: Updates RLS policies for ical_feeds, cohost_properties, and bookings to use the get_my_workspace_ids() helper function.
-- This prevents infinite recursion and RLS violations during INSERTs.

BEGIN;

-- ============================================
-- 1. FIX COHOST_PROPERTIES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view properties in their workspace" ON cohost_properties;
DROP POLICY IF EXISTS "Users can manage properties in their workspace" ON cohost_properties;

-- Use ANY(get_my_workspace_ids()) for clean, non-recursive access
CREATE POLICY "Users can view properties in their workspace"
  ON cohost_properties FOR SELECT
  USING (
    workspace_id = ANY(get_my_workspace_ids())
  );

CREATE POLICY "Users can manage properties in their workspace"
  ON cohost_properties FOR ALL
  USING (
    workspace_id = ANY(get_my_workspace_ids())
  );
-- Note: FOR ALL covers INSERT, UPDATE, DELETE. 
-- For INSERT, it checks the NEW row's workspace_id.


-- ============================================
-- 2. FIX BOOKINGS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view bookings in their workspace" ON bookings;
DROP POLICY IF EXISTS "Users can manage bookings in their workspace" ON bookings;

CREATE POLICY "Users can view bookings in their workspace"
  ON bookings FOR SELECT
  USING (
    workspace_id = ANY(get_my_workspace_ids())
  );

CREATE POLICY "Users can manage bookings in their workspace"
  ON bookings FOR ALL
  USING (
    workspace_id = ANY(get_my_workspace_ids())
  );


-- ============================================
-- 3. FIX ICAL_FEEDS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view feeds for their properties" ON ical_feeds;
DROP POLICY IF EXISTS "Users can manage feeds for their properties" ON ical_feeds;

-- We need to check if the property belongs to a workspace the user is in.
-- We can check cohost_properties directly. Since cohost_properties now uses get_my_workspace_ids(),
-- querying it is safe from recursion relating to members.

CREATE POLICY "Users can view feeds for their properties"
  ON ical_feeds FOR SELECT
  USING (
    property_id IN (
      SELECT id FROM cohost_properties
      WHERE workspace_id = ANY(get_my_workspace_ids())
    )
  );

CREATE POLICY "Users can manage feeds for their properties"
  ON ical_feeds FOR ALL
  USING (
    property_id IN (
      SELECT id FROM cohost_properties
      WHERE workspace_id = ANY(get_my_workspace_ids())
    )
  );

COMMIT;
