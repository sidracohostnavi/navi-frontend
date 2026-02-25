-- Migration: Add role and invite_url columns to cohost_workspace_invites
-- role: stores the structured role (admin/manager/cleaner) assigned on accept
-- invite_url: stores the full invite link so it's always retrievable (no localStorage dependency)

BEGIN;

-- Add role column with default 'cleaner' (most restrictive)
ALTER TABLE public.cohost_workspace_invites
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'cleaner';

-- Add invite_url column for server-side link persistence
ALTER TABLE public.cohost_workspace_invites
  ADD COLUMN IF NOT EXISTS invite_url TEXT;

-- Backfill: existing pending invites get 'member' to preserve current behavior
UPDATE public.cohost_workspace_invites
  SET role = 'member'
  WHERE role = 'cleaner' AND status = 'pending';

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
