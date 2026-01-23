-- Migration: Fix Workspace Insert Policy
-- Description: Ensures users can create their own workspaces and view them immediately.

BEGIN;

-- 1. Ensure INSERT policy exists
-- Drop potential duplicates first
DROP POLICY IF EXISTS "Users can insert workspaces (start own)" ON cohost_workspaces;
DROP POLICY IF EXISTS "Users can create workspaces" ON cohost_workspaces;

CREATE POLICY "Users can create workspaces"
  ON cohost_workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- 2. Ensure SELECT policy exists for OWNERS
-- (Crucial for insert().select() to work before the member row is added)
DROP POLICY IF EXISTS "Owners can view their workspaces" ON cohost_workspaces;

CREATE POLICY "Owners can view their workspaces"
    ON cohost_workspaces FOR SELECT
    USING (owner_id = auth.uid());

COMMIT;
