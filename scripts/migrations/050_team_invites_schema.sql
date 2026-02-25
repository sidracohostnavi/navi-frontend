BEGIN;

-- 1. Create cohost_workspace_invites (if completely missing)
CREATE TABLE IF NOT EXISTS public.cohost_workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add columns explicitly (idempotent fix for partial tables)
ALTER TABLE public.cohost_workspace_invites
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS invitee_email TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS invitee_name TEXT,
  ADD COLUMN IF NOT EXISTS role_label TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS token_last4 TEXT,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS can_view_calendar BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_guest_name BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_guest_count BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_booking_notes BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_contact_info BOOLEAN NOT NULL DEFAULT false;

-- 2b. Backfill invitee_email from legacy 'email' if it exists (Safety Step)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cohost_workspace_invites' AND column_name = 'email') THEN
    UPDATE public.cohost_workspace_invites 
    SET invitee_email = email 
    WHERE invitee_email IS NULL;
  END IF;
END $$;

-- 2c. Enforce NOT NULL on invitee_email
ALTER TABLE public.cohost_workspace_invites ALTER COLUMN invitee_email SET NOT NULL;

-- 2d. Drop legacy 'email' column (Fix for "null value in column email" error)
ALTER TABLE public.cohost_workspace_invites DROP COLUMN IF EXISTS email;

-- 2e. Drop legacy 'token' column (Fix for "null value in column token" error)
ALTER TABLE public.cohost_workspace_invites DROP COLUMN IF EXISTS token;

-- 3. Indexes & Constraints

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invites_token_hash ON public.cohost_workspace_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON public.cohost_workspace_invites(workspace_id);
-- Useful for listing by email (e.g. "Am I invited?")
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON public.cohost_workspace_invites(invitee_email);

-- Enable RLS
ALTER TABLE public.cohost_workspace_invites ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace Members can view invites
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cohost_workspace_invites' 
    AND policyname = 'Members can view invites'
  ) THEN
    CREATE POLICY "Members can view invites" ON public.cohost_workspace_invites
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.cohost_workspace_members m
          WHERE m.workspace_id = cohost_workspace_invites.workspace_id
          AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: Admins can manage invites
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cohost_workspace_invites' 
    AND policyname = 'Admins can manage invites'
  ) THEN
    CREATE POLICY "Admins can manage invites" ON public.cohost_workspace_invites
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.cohost_workspace_members m
          WHERE m.workspace_id = cohost_workspace_invites.workspace_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

-- 4. Augment cohost_workspace_members
ALTER TABLE public.cohost_workspace_members
  ADD COLUMN IF NOT EXISTS role_label TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id);

COMMIT;

NOTIFY pgrst, 'reload schema';
