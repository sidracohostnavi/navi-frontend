-- Expand cohost_properties with additional pricing fields
ALTER TABLE cohost_properties 
ADD COLUMN IF NOT EXISTS max_nights INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS additional_fees JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS taxes JSONB DEFAULT '[]'::jsonb;

-- Ensure policy_id exists (from previous migration if not applied)
ALTER TABLE cohost_properties 
ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES booking_policies(id);

COMMENT ON COLUMN cohost_properties.additional_fees IS 'Array of {name: string, amount: number, type: "fixed" | "percentage"}';
COMMENT ON COLUMN cohost_properties.taxes IS 'Array of {name: string, amount: number, type: "fixed" | "percentage"}';
