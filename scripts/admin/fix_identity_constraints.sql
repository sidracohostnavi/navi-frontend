-- Identity Integrity Fix
-- 1. Deduplicate Memberships
-- 2. Add Unique Constraint
-- 3. Verify

BEGIN;

-- 1. Deduplicate cohost_workspace_members
-- Keep the OLDEST membership for any (workspace_id, user_id) pair.
-- Delete any newer duplicates.
CREATE TEMP TABLE duplicates_to_delete AS
SELECT id
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY workspace_id, user_id ORDER BY created_at ASC) as rn
  FROM public.cohost_workspace_members
) t
WHERE rn > 1;

DELETE FROM public.cohost_workspace_members
WHERE id IN (SELECT id FROM duplicates_to_delete);

-- Log how many were deleted (for verification output)
DO $$
DECLARE
  deleted_count INT;
BEGIN
  SELECT count(*) INTO deleted_count FROM duplicates_to_delete;
  RAISE NOTICE 'Deleted % duplicate memberships.', deleted_count;
END $$;

-- 2. Add Constraint
-- This ensures ensureWorkspace.ts upsert logic works correctly/idempotently via ON CONFLICT.
ALTER TABLE public.cohost_workspace_members
ADD CONSTRAINT cohost_workspace_members_workspace_user_key UNIQUE (workspace_id, user_id);

-- 3. Cleanup: Drop temp table
DROP TABLE duplicates_to_delete;

COMMIT;

-- 4. Verification (Read-only check after commit)
SELECT 
  (SELECT count(*) FROM public.cohost_workspace_members) as total_memberships,
  (SELECT count(*) FROM (SELECT DISTINCT workspace_id, user_id FROM public.cohost_workspace_members) t) as unique_memberships_pairs;
