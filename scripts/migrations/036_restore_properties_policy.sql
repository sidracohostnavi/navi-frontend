-- Migration: Restore Properties RLS
-- Description: Reverts the RLS policy for cohost_properties to use a direct subquery.
-- This ensures visibility even if the helper function has context issues.

BEGIN;

-- 1. Drop the function-based policies
DROP POLICY IF EXISTS "Users can view properties in their workspace" ON cohost_properties;
DROP POLICY IF EXISTS "Users can manage properties in their workspace" ON cohost_properties;

-- 2. Re-create standard subquery policies
-- Accessing cohost_workspace_members is safe because that table's policy was fixed in 012 to avoid recursion.

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

COMMIT;
