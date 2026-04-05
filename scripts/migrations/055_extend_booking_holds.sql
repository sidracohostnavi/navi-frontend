-- Extend booking_holds for quote workflow
ALTER TABLE booking_holds
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES cohost_workspaces(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS guest_first_name TEXT,
ADD COLUMN IF NOT EXISTS guest_last_name TEXT,
ADD COLUMN IF NOT EXISTS guest_email TEXT,
ADD COLUMN IF NOT EXISTS guest_phone TEXT,
ADD COLUMN IF NOT EXISTS guest_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS guest_country TEXT,
ADD COLUMN IF NOT EXISTS guest_language TEXT DEFAULT 'English',
ADD COLUMN IF NOT EXISTS source TEXT, -- 'phone', 'email', 'walk-in', etc
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS total_price INTEGER, -- cents
ADD COLUMN IF NOT EXISTS price_breakdown JSONB,
ADD COLUMN IF NOT EXISTS policy_id UUID,
ADD COLUMN IF NOT EXISTS payment_link_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' 
  CHECK (status IN ('draft', 'pending', 'expired', 'converted', 'cancelled', 'superseded')),
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Backfill workspace_id from property
UPDATE booking_holds h
SET workspace_id = p.workspace_id
FROM cohost_properties p
WHERE h.property_id = p.id
AND h.workspace_id IS NULL;

-- Add index for payment token lookup
CREATE INDEX IF NOT EXISTS idx_holds_payment_token ON booking_holds(payment_link_token) WHERE payment_link_token IS NOT NULL;

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_holds_status ON booking_holds(status) WHERE status IN ('draft', 'pending');

-- RLS policies
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workspace holds"
  ON booking_holds FOR SELECT
  USING (workspace_id IN (
    SELECT m.workspace_id FROM cohost_workspace_members m WHERE m.user_id = auth.uid()
  ));

CREATE POLICY "Owners/managers can manage holds"
  ON booking_holds FOR ALL
  USING (workspace_id IN (
    SELECT m.workspace_id FROM cohost_workspace_members m
    WHERE m.user_id = auth.uid() AND m.role IN ('owner', 'manager', 'admin')
  ));
