-- Migration: Secure Connections RLS & Fallback Trigger (Clean Fix)
-- Description: Phase 3. Enforces RLS, Fallback Trigger, and Immutability Trigger.

BEGIN;

-- =================================================================
-- 1. FALLBACK TRIGGER (Option F1)
-- Handle legacy clients not sending workspace_id (auto-fill from context)
-- =================================================================

CREATE OR REPLACE FUNCTION public.connection_set_default_workspace()
RETURNS TRIGGER AS $$
DECLARE
    active_ws_id UUID;
BEGIN
    -- If workspace_id is already provided, do nothing
    IF NEW.workspace_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Look up active workspace preference
    SELECT workspace_id INTO active_ws_id
    FROM public.cohost_user_preferences
    WHERE user_id = auth.uid();

    -- If found, set it
    IF active_ws_id IS NOT NULL THEN
        NEW.workspace_id := active_ws_id;
    END IF;

    -- If not found, stay NULL (RLS checks will handle failures)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow re-run
DROP TRIGGER IF EXISTS trg_connection_set_default_workspace ON public.connections;

CREATE TRIGGER trg_connection_set_default_workspace
BEFORE INSERT ON public.connections
FOR EACH ROW
EXECUTE FUNCTION public.connection_set_default_workspace();


-- =================================================================
-- 2. IMMUTABILITY TRIGGER
-- Prevent moving connections between workspaces
-- (Replaces WITH CHECK (OLD.workspace_id = ...) which caused SQL errors)
-- =================================================================

CREATE OR REPLACE FUNCTION public.connection_prevent_workspace_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updates if workspace_id hasn't changed
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
        RAISE EXCEPTION 'Workspace ID is immutable for connections.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connection_immutable_workspace ON public.connections;

CREATE TRIGGER trg_connection_immutable_workspace
BEFORE UPDATE ON public.connections
FOR EACH ROW
EXECUTE FUNCTION public.connection_prevent_workspace_change();


-- =================================================================
-- 3. RLS POLICIES
-- =================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own connections" ON public.connections;
DROP POLICY IF EXISTS "Users can insert own connections" ON public.connections;
DROP POLICY IF EXISTS "Users can update own connections" ON public.connections;
DROP POLICY IF EXISTS "Users can delete own connections" ON public.connections;
DROP POLICY IF EXISTS "Users can view workspace scoped connections" ON public.connections;
DROP POLICY IF EXISTS "Users can insert workspace scoped connections" ON public.connections;
DROP POLICY IF EXISTS "Users can update workspace scoped connections" ON public.connections;
DROP POLICY IF EXISTS "Users can delete workspace scoped connections" ON public.connections;

-- A. SELECT POLICY
-- 1. Owner
-- 2. Member of workspace (or orphan)
CREATE POLICY "Users can view workspace scoped connections"
ON public.connections FOR SELECT
USING (
    user_id = auth.uid() 
    AND (
        workspace_id IS NULL -- Legacy Orphan Support
        OR 
        workspace_id IN (
            SELECT workspace_id 
            FROM public.cohost_workspace_members 
            WHERE user_id = auth.uid()
        )
    )
);

-- B. INSERT POLICY
-- 1. Owner
-- 2. NOT NULL workspace (trigger will pop)
-- 3. Member of target workspace
CREATE POLICY "Users can insert workspace scoped connections"
ON public.connections FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IS NOT NULL
    AND workspace_id IN (
        SELECT workspace_id 
        FROM public.cohost_workspace_members 
        WHERE user_id = auth.uid()
    )
);

-- C. UPDATE POLICY
-- 1. Owner
-- 2. Member of workspace (Implicitly 'OLD' row)
CREATE POLICY "Users can update workspace scoped connections"
ON public.connections FOR UPDATE
USING (
    user_id = auth.uid()
    AND workspace_id IN (
        SELECT workspace_id 
        FROM public.cohost_workspace_members 
        WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    -- Verify NEW row is compliant (still member of workspace)
    -- Trigger handles immutability, so we just check validity.
    user_id = auth.uid()
    AND workspace_id IN (
        SELECT workspace_id 
        FROM public.cohost_workspace_members 
        WHERE user_id = auth.uid()
    )
);

-- D. DELETE POLICY
-- 1. Owner
-- 2. Scope (must see it to delete it)
CREATE POLICY "Users can delete workspace scoped connections"
ON public.connections FOR DELETE
USING (
    user_id = auth.uid()
    -- Maintain same scoping as SELECT
    AND (
        workspace_id IS NULL 
        OR 
        workspace_id IN (
            SELECT workspace_id 
            FROM public.cohost_workspace_members 
            WHERE user_id = auth.uid()
        )
    )
);

COMMIT;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_connection_set_default_workspace ON public.connections;
-- DROP TRIGGER IF EXISTS trg_connection_immutable_workspace ON public.connections;
-- DROP FUNCTION IF EXISTS public.connection_set_default_workspace();
-- DROP FUNCTION IF EXISTS public.connection_prevent_workspace_change();
-- DROP POLICY "Users can view workspace scoped connections" ON public.connections;
-- ... (and drop insert/update/delete policies)
