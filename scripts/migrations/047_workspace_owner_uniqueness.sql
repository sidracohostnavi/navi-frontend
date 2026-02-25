BEGIN;

-- Backfill owner_id deterministically: earliest owner by joined_at, then user_id
WITH ranked AS (
  SELECT
    workspace_id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id
      ORDER BY joined_at ASC NULLS LAST, user_id ASC
    ) AS rn
  FROM cohost_workspace_members
  WHERE role = 'owner'
)
UPDATE cohost_workspaces w
SET owner_id = r.user_id
FROM ranked r
WHERE w.id = r.workspace_id
  AND w.owner_id IS NULL
  AND r.rn = 1;

-- Enforce single workspace per owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_cohost_workspaces_owner_unique
  ON cohost_workspaces(owner_id)
  WHERE owner_id IS NOT NULL;

-- Ensure membership uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_unique
  ON cohost_workspace_members(workspace_id, user_id);

COMMIT;
