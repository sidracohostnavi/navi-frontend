-- Migration: Create memories table with domain isolation
-- Description: Stores domain-scoped memories with RLS and strict type constraints
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN ('cohost', 'mom', 'orakl', 'global')),
  scope_type TEXT NOT NULL, -- 'property', 'reservation', 'child', 'relationship', 'user'
  scope_id UUID, -- Optional: specific entity ID this memory relates to
  memory_type TEXT NOT NULL CHECK (memory_type IN ('fact', 'preference', 'event', 'constraint')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system', 'derived')),
  confidence NUMERIC DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

-- Primary access pattern: fetch by workspace and domain
CREATE INDEX idx_memories_workspace_domain ON memories(workspace_id, domain);

-- Entity lookup pattern: fetch by specific scope (e.g., all memories for a property)
CREATE INDEX idx_memories_scope ON memories(workspace_id, scope_type, scope_id);

-- Content search (optional, basic text search)
CREATE INDEX idx_memories_content ON memories USING gin(to_tsvector('english', content));

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. CREATE RLS POLICIES
-- ============================================

-- Policy: SELECT - Users can view memories for their workspaces
CREATE POLICY "Users can view memories for their workspaces"
  ON memories FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: INSERT - Users can add memories to their workspaces
CREATE POLICY "Users can add memories to their workspaces"
  ON memories FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: UPDATE - Users can update memories in their workspaces
CREATE POLICY "Users can update memories in their workspaces"
  ON memories FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: DELETE - Users can delete memories from their workspaces
CREATE POLICY "Users can delete memories from their workspaces"
  ON memories FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 5. CREATE UPDATED_AT TRIGGER
-- ============================================

-- Reuse existing function if available, or create new one
CREATE OR REPLACE FUNCTION update_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_memories_updated_at();

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON memories TO authenticated;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'memories';

-- Check policies
SELECT policyname FROM pg_policies WHERE tablename = 'memories';
