-- Migration: Create workspace_apps table with RLS policies
-- Description: Enables app management per workspace with proper security
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE workspace_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  app_key TEXT NOT NULL CHECK (app_key IN ('cohost', 'momassist', 'orakl')),
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'trial', 'disabled')),
  enabled_at TIMESTAMPTZ DEFAULT now(),
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, app_key)
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

-- Index for workspace lookups (most common query pattern)
CREATE INDEX idx_workspace_apps_workspace_id ON workspace_apps(workspace_id);

-- Index for status filtering
CREATE INDEX idx_workspace_apps_status ON workspace_apps(status);

-- Composite index for common query: workspace + enabled apps
CREATE INDEX idx_workspace_apps_workspace_status ON workspace_apps(workspace_id, status);

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE workspace_apps ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. CREATE RLS POLICIES
-- ============================================

-- Policy: SELECT - Users can view apps for their workspaces
CREATE POLICY "Users can view apps for their workspaces"
  ON workspace_apps FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: INSERT - Users can add apps to their workspaces
CREATE POLICY "Users can add apps to their workspaces"
  ON workspace_apps FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: UPDATE - Users can update apps in their workspaces
CREATE POLICY "Users can update apps in their workspaces"
  ON workspace_apps FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: DELETE - Users can delete apps from their workspaces
CREATE POLICY "Users can delete apps from their workspaces"
  ON workspace_apps FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 5. CREATE UPDATED_AT TRIGGER
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_apps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER workspace_apps_updated_at
  BEFORE UPDATE ON workspace_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_apps_updated_at();

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

-- Grant access to authenticated users (RLS will control actual access)
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_apps TO authenticated;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify table was created
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name = 'workspace_apps';

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'workspace_apps';

-- Verify policies were created
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'workspace_apps';

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment to insert sample data for your workspace
-- Replace <your_workspace_id> with actual workspace ID

/*
INSERT INTO workspace_apps (workspace_id, app_key, status)
VALUES 
  ('<your_workspace_id>', 'cohost', 'enabled'),
  ('<your_workspace_id>', 'momassist', 'trial'),
  ('<your_workspace_id>', 'orakl', 'disabled');
*/
