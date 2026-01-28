-- Migration: Add workspace_id to connections
-- Description: Phase 1 of Connection Scoping. Adds nullable column for future scoping.
-- Safety: Nullable, No Cascade, No RLS changes yet.

BEGIN;

-- 1. Add NULLABLE workspace_id column
-- We explicitly avoid ON DELETE CASCADE for now to be safe (default is RESTRICT/NO ACTION)
ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES cohost_workspaces(id);

-- 2. Create Index for future performance
CREATE INDEX IF NOT EXISTS idx_connections_workspace_id ON connections(workspace_id);

COMMIT;

-- VERIFICATION:
-- select column_name, is_nullable from information_schema.columns where table_name='connections' and column_name='workspace_id';

-- ROLLBACK:
-- drop index if exists idx_connections_workspace_id;
-- alter table connections drop column if exists workspace_id;
