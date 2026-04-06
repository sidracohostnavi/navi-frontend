
-- Add policy_id to cohost_properties
ALTER TABLE cohost_properties 
ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES booking_policies(id);

-- Optional: Set default policy for existing properties if one is marked as default
UPDATE cohost_properties p
SET policy_id = b.id
FROM booking_policies b
WHERE p.workspace_id = b.workspace_id 
AND b.is_default = true
AND p.policy_id IS NULL;
