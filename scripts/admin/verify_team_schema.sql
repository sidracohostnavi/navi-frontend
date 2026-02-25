-- Verification Script for Team/Invite Schema

-- 1. Check if table exists and list columns
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'cohost_workspace_invites'
ORDER BY ordinal_position;

-- 2. Check for new columns in cohost_workspace_members
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cohost_workspace_members' 
AND column_name IN ('role_label', 'is_active', 'deactivated_at', 'deactivated_by');

-- 3. Check for specific Policies (optional/informational)
SELECT policyname, tablename, roles, cmd 
FROM pg_policies 
WHERE tablename = 'cohost_workspace_invites';

-- 4. Check for Indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'cohost_workspace_invites';
