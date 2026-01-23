-- Migration: Fix Workspace Member Policies
-- Description: Adds missing RLS policies to allow users to add themselves as members when creating a workspace.

BEGIN;

-- Allow users to add themselves to a workspace (e.g. during creation)
CREATE POLICY "Users can join workspaces (self-insert)"
  ON cohost_workspace_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Allow workspace admins/owners to add others (optional for now, but good to have)
CREATE POLICY "Admins can add members"
  ON cohost_workspace_members FOR INSERT
  WITH CHECK (
    workspace_id IN (
        SELECT workspace_id FROM cohost_workspace_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

COMMIT;
