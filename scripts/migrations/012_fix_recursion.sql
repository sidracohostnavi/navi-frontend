-- Migration: Fix Infinite Recursion in RLS
-- Description: Introduces a SECURITY DEFINER function to fetch workspace memberships without triggering RLS loops.
-- Updates cohost_workspace_members policies to use this function.

BEGIN;

-- 1. Create Helper Function (Bypasses RLS)
CREATE OR REPLACE FUNCTION get_my_workspace_ids()
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN ARRAY(
        SELECT workspace_id 
        FROM cohost_workspace_members 
        WHERE user_id = auth.uid()
    );
END;
$$;

-- 2. Drop Old Recursive Policies
DROP POLICY IF EXISTS "Users can view members of their workspaces" ON cohost_workspace_members;
DROP POLICY IF EXISTS "Admins can add members" ON cohost_workspace_members;
DROP POLICY IF EXISTS "Users can join workspaces (self-insert)" ON cohost_workspace_members;

-- 3. Re-create Policies using the Safe Function

-- SELECT: View self OR view other members in my workspaces
CREATE POLICY "Users can view members of their workspaces"
  ON cohost_workspace_members FOR SELECT
  USING (
    user_id = auth.uid() OR 
    workspace_id = ANY(get_my_workspace_ids())
  );

-- INSERT (Self-join): Already safe, but good to be explicit
CREATE POLICY "Users can join workspaces (self-insert)"
  ON cohost_workspace_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- INSERT (Admin add): Use function to check if I am an admin in that workspace
CREATE POLICY "Admins can add members"
  ON cohost_workspace_members FOR INSERT
  WITH CHECK (
    workspace_id IN (
        SELECT workspace_id 
        FROM cohost_workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ) -- safe because this subquery is on the same table BUT restricted by auth.uid(). 
      -- Ideally we'd use a function for 'is_admin' too if this recurses, but let's try the array function first for the main loop.
  );
  
-- NOTE: The "Admins can add members" might still be risky if not careful, 
-- but the main recursion usually comes from the SELECT policy loop.
-- To be absolutely safe, let's make an is_workspace_admin function too.

CREATE OR REPLACE FUNCTION is_workspace_admin(lookup_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM cohost_workspace_members 
        WHERE user_id = auth.uid() 
        AND workspace_id = lookup_workspace_id 
        AND role IN ('owner', 'admin')
    );
END;
$$;

-- Re-define Admin Policy using safe function
CREATE OR REPLACE POLICY "Admins can add members"
  ON cohost_workspace_members FOR INSERT
  WITH CHECK (
    is_workspace_admin(workspace_id)
  );

COMMIT;
