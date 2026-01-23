-- Migration: Create enrichment_review_items table
-- Description: Stores ambiguous or low-confidence enrichment results for manual review.

CREATE TABLE IF NOT EXISTS enrichment_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  
  -- Extracted data that needs review
  extracted_data JSONB NOT NULL, -- { name, guests, dates, email, listing_name, raw_subject }
  
  -- Potential booking matches found by the logic
  suggested_matches JSONB, -- Array of { booking_id, score, reason, guest_name, dates }
  
  -- Metadata
  status TEXT NOT NULL DEFAULT 'pending', -- pending | resolved | dismissed
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Policies
ALTER TABLE enrichment_review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view review items for their workspace"
  ON enrichment_review_items FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage review items for their workspace"
  ON enrichment_review_items FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM cohost_workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enrichment_review_ws ON enrichment_review_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_review_status ON enrichment_review_items(status);
