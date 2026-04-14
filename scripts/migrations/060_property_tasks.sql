BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 1: property_tasks
-- Core task records. task_type = one_off | recurring.
-- For recurring tasks, next_due_at is recalculated on each completion.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  property_id      UUID REFERENCES public.cohost_properties(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  title            TEXT NOT NULL,
  description      TEXT,
  task_type        TEXT NOT NULL DEFAULT 'one_off'
                     CHECK (task_type IN ('one_off', 'recurring')),
  recurrence_days  INTEGER,          -- only meaningful when task_type = 'recurring'
  due_at           TIMESTAMPTZ,      -- explicit due date (one_off); null = no deadline
  next_due_at      TIMESTAMPTZ,      -- computed due date (recurring) or same as due_at
  last_completed_at TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'cancelled')),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_tasks_workspace   ON public.property_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_property_tasks_assigned    ON public.property_tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_property_tasks_property    ON public.property_tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_property_tasks_next_due    ON public.property_tasks(next_due_at);
CREATE INDEX IF NOT EXISTS idx_property_tasks_status      ON public.property_tasks(workspace_id, status, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 2: task_completions
-- One row per completion event. Recurring tasks accumulate many rows.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_completions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                   UUID NOT NULL REFERENCES public.property_tasks(id) ON DELETE CASCADE,
  completed_by_user_id      UUID NOT NULL REFERENCES auth.users(id),
  completed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  hours_worked              NUMERIC(5,2),
  completion_note           TEXT,
  calculated_amount_owed    NUMERIC(10,2),
  host_payment_confirmed_at TIMESTAMPTZ,
  host_payment_confirmed_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_task ON public.task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_user ON public.task_completions(completed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_unpaid ON public.task_completions(task_id)
  WHERE host_payment_confirmed_at IS NULL AND calculated_amount_owed IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 3: team_pay_rates
-- One row per (workspace, user) pair. Host sets hourly rate per team member.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_pay_rates (
  workspace_id UUID NOT NULL REFERENCES public.cohost_workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hourly_rate  NUMERIC(8,2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES auth.users(id),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_pay_rates_workspace ON public.team_pay_rates(workspace_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: All tables use service role from API routes (bypasses RLS).
-- Policies below provide defence-in-depth if anon client is ever used.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.property_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_pay_rates    ENABLE ROW LEVEL SECURITY;

-- property_tasks: any active workspace member can SELECT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'property_tasks' AND policyname = 'Workspace members can view tasks'
  ) THEN
    CREATE POLICY "Workspace members can view tasks" ON public.property_tasks
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.cohost_workspace_members m
          WHERE m.workspace_id = property_tasks.workspace_id
            AND m.user_id = auth.uid()
            AND m.is_active = true
        )
      );
  END IF;
END $$;

-- property_tasks: owner/admin/manager can INSERT/UPDATE/DELETE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'property_tasks' AND policyname = 'Admins can manage tasks'
  ) THEN
    CREATE POLICY "Admins can manage tasks" ON public.property_tasks
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.cohost_workspace_members m
          WHERE m.workspace_id = property_tasks.workspace_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin', 'manager')
            AND m.is_active = true
        )
      );
  END IF;
END $$;

-- task_completions: workspace members can SELECT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_completions' AND policyname = 'Workspace members can view completions'
  ) THEN
    CREATE POLICY "Workspace members can view completions" ON public.task_completions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.property_tasks t
          JOIN public.cohost_workspace_members m ON m.workspace_id = t.workspace_id
          WHERE t.id = task_completions.task_id
            AND m.user_id = auth.uid()
            AND m.is_active = true
        )
      );
  END IF;
END $$;

-- team_pay_rates: owner/admin can view
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'team_pay_rates' AND policyname = 'Admins can manage pay rates'
  ) THEN
    CREATE POLICY "Admins can manage pay rates" ON public.team_pay_rates
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.cohost_workspace_members m
          WHERE m.workspace_id = team_pay_rates.workspace_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
            AND m.is_active = true
        )
      );
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
