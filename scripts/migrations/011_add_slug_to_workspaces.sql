-- Migration: Add slug to cohost_workspaces (Fix for Schema Cache Error)
-- Description: Ensures the 'slug' column exists on cohost_workspaces.
-- This handles legacy tables that might have been created before slugs were introduced.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cohost_workspaces' AND column_name = 'slug') THEN
        ALTER TABLE cohost_workspaces ADD COLUMN slug TEXT;
        ALTER TABLE cohost_workspaces ADD CONSTRAINT cohost_workspaces_slug_key UNIQUE (slug);
        
        -- Backfill existing rows with a random slug to satisfy NOT NULL if decided later
        UPDATE cohost_workspaces SET slug = 'ws-' || substr(md5(random()::text), 1, 8) WHERE slug IS NULL;
        
        -- Optionally make it NOT NULL after backfill
        ALTER TABLE cohost_workspaces ALTER COLUMN slug SET NOT NULL;
    END IF;
END $$;
