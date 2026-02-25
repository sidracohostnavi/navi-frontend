-- Create table for linking users to specific properties
CREATE TABLE IF NOT EXISTS cohost_user_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES cohost_properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

-- RLS
ALTER TABLE cohost_user_properties ENABLE ROW LEVEL SECURITY;

-- Policies
-- Owners and Admins can manage (insert/update/delete)
CREATE POLICY "Owners and Admins can manage user properties" ON cohost_user_properties
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cohost_workspace_members
      WHERE user_id = auth.uid()
      AND workspace_id = cohost_user_properties.workspace_id
      AND role IN ('owner', 'admin')
    )
  );

-- Users can view their own assignments
CREATE POLICY "Users can view their own assignments" ON cohost_user_properties
  FOR SELECT
  USING (user_id = auth.uid());
