-- Migration: Setup Property Wizard Fields
-- Description: Ensures cohost_properties has all columns needed for the onboarding wizard.

-- 1. Ensure workspace_id exists (Fix for potential sync issue)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cohost_properties' AND column_name = 'workspace_id') THEN
        ALTER TABLE cohost_properties ADD COLUMN workspace_id UUID REFERENCES cohost_workspaces(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Add Wizard Columns
ALTER TABLE cohost_properties
ADD COLUMN IF NOT EXISTS property_type TEXT,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS max_guests INTEGER,
ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
ADD COLUMN IF NOT EXISTS beds INTEGER,
ADD COLUMN IF NOT EXISTS bathrooms NUMERIC,
ADD COLUMN IF NOT EXISTS amenities TEXT[], -- Array of strings from checklist
ADD COLUMN IF NOT EXISTS house_rules JSONB, -- JSON for toggles: { pets: bool, smoking: bool, ... } and notes
ADD COLUMN IF NOT EXISTS check_in_time TEXT,
ADD COLUMN IF NOT EXISTS check_out_time TEXT,
ADD COLUMN IF NOT EXISTS entry_method TEXT,
ADD COLUMN IF NOT EXISTS check_in_instructions TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT;

-- 3. Ensure RLS index exists for workspace_id
-- (Safe to run even if already exists, usually)
CREATE INDEX IF NOT EXISTS idx_cohost_properties_workspace ON cohost_properties(workspace_id);
