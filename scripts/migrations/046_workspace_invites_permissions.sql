BEGIN;

-- Extend members with permissions + status
ALTER TABLE cohost_workspace_members
  ADD COLUMN IF NOT EXISTS role_label TEXT,
  ADD COLUMN IF NOT EXISTS can_view_calendar BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_guest_name BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_guest_count BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_booking_notes BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_contact_info BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id);

-- Ensure workspace membership helper respects deactivation
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
      AND is_active = true
  );
END;
$$;

-- Ensure admin checks respect deactivation
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
      AND is_active = true
  );
END;
$$;

-- Workspace invites
CREATE TABLE IF NOT EXISTS cohost_workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_name TEXT,
  role_label TEXT,
  can_view_calendar BOOLEAN NOT NULL DEFAULT true,
  can_view_guest_name BOOLEAN NOT NULL DEFAULT true,
  can_view_guest_count BOOLEAN NOT NULL DEFAULT true,
  can_view_booking_notes BOOLEAN NOT NULL DEFAULT false,
  can_view_contact_info BOOLEAN NOT NULL DEFAULT false,
  token_hash TEXT NOT NULL,
  token_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  accepted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invites_token_hash ON cohost_workspace_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON cohost_workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON cohost_workspace_invites(invitee_email);

ALTER TABLE cohost_workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view invites in their workspaces"
  ON cohost_workspace_invites FOR SELECT
  USING (workspace_id = ANY(get_my_workspace_ids()));

CREATE POLICY "Admins can create invites"
  ON cohost_workspace_invites FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "Admins can update invites"
  ON cohost_workspace_invites FOR UPDATE
  USING (is_workspace_admin(workspace_id));

COMMIT;
