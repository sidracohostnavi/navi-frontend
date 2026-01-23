-- Migration: Initialize Workspaces
-- Description: Creates the base tables for the workspace system.
-- Run this FIRST if you are setting up from scratch.

-- 1. Create cohost_workspaces
CREATE TABLE IF NOT EXISTS cohost_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Self-healing: Ensure owner_id exists (if table existed from old migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cohost_workspaces' AND column_name = 'owner_id') THEN
        -- Allow NULL for existing rows to prevent migration failure
        ALTER TABLE cohost_workspaces ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Create cohost_workspace_members
CREATE TABLE IF NOT EXISTS cohost_workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- 3. RLS for Workspaces

ALTER TABLE cohost_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspaces they are members of"
  ON cohost_workspaces FOR SELECT
  USING (
    id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update their workspaces"
    ON cohost_workspaces FOR UPDATE
    USING (owner_id = auth.uid());
    
CREATE POLICY "Users can insert workspaces (start own)"
    ON cohost_workspaces FOR INSERT
    WITH CHECK (owner_id = auth.uid());


-- 4. RLS for Members

ALTER TABLE cohost_workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members of their workspaces"
  ON cohost_workspace_members FOR SELECT
  USING (
    user_id = auth.uid() OR -- View self membership
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid() -- View others in same workspace
    )
  );

-- Self-join policy needed for admin management usually, kept simple for now
