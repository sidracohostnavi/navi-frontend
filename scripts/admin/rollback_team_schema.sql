-- Rollback Script for Team/Invite Schema
-- WARNING: This will delete data in cohost_workspace_invites and the new columns in members.

BEGIN;

-- 1. Drop the new table
DROP TABLE IF EXISTS public.cohost_workspace_invites CASCADE;

-- 2. Drop columns from cohost_workspace_members
-- Note: We use IF EXISTS to be safe, but ideally determining if these were pre-existing is hard. 
-- Based on the migration, we added them.
ALTER TABLE public.cohost_workspace_members DROP COLUMN IF EXISTS role_label;
ALTER TABLE public.cohost_workspace_members DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.cohost_workspace_members DROP COLUMN IF EXISTS deactivated_at;
ALTER TABLE public.cohost_workspace_members DROP COLUMN IF EXISTS deactivated_by;

COMMIT;

NOTIFY pgrst, 'reload schema';
