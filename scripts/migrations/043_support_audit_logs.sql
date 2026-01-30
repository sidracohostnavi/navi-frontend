-- Create support_audit_logs table
create table if not exists public.support_audit_logs (
    id uuid not null default gen_random_uuid(),
    support_user_id uuid not null references auth.users(id),
    target_workspace_id uuid not null references public.cohost_workspaces(id),
    action text not null,
    details jsonb,
    created_at timestamp with time zone not null default now(),
    constraint support_audit_logs_pkey primary key (id)
);

-- Enable RLS
alter table public.support_audit_logs enable row level security;

-- Only service role can insert/read for now (or authorized admins if we add policies later)
-- For now we rely on server-side service role execution to insert logs.
-- But if we want to allow `select` for developers to verify, we might need a policy.
-- Let's stick to service-role only for writing.

create policy "Service role can do everything on support_audit_logs"
    on public.support_audit_logs
    for all
    using ( true )
    with check ( true );
