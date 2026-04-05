-- Add pricing columns to properties
ALTER TABLE cohost_properties
ADD COLUMN IF NOT EXISTS base_nightly_rate INTEGER,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS min_nights INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_guests INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS base_guests_included INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS extra_guest_fee INTEGER;

-- Create fees table
CREATE TABLE IF NOT EXISTS workspace_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  amount INTEGER,
  percentage NUMERIC(5,2),
  fee_type TEXT NOT NULL CHECK (fee_type IN ('fixed', 'percentage')),
  
  is_tax BOOLEAN DEFAULT FALSE,
  is_required BOOLEAN DEFAULT TRUE,
  applies_to_property_ids UUID[],
  
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_fees_workspace ON workspace_fees(workspace_id);

-- Add RLS
ALTER TABLE workspace_fees ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Users can view their workspace fees"
  ON workspace_fees FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM cohost_workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Owners can manage their workspace fees"
  ON workspace_fees FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM cohost_workspace_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));
