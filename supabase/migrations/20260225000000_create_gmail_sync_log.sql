CREATE TABLE IF NOT EXISTS public.gmail_sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    emails_scanned INTEGER DEFAULT 0 NOT NULL,
    bookings_enriched INTEGER DEFAULT 0 NOT NULL,
    review_items_created INTEGER DEFAULT 0 NOT NULL,
    success BOOLEAN DEFAULT false NOT NULL,
    error_message TEXT,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_gmail_sync_log_connection_id ON public.gmail_sync_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_gmail_sync_log_workspace_id ON public.gmail_sync_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_gmail_sync_log_synced_at ON public.gmail_sync_log(synced_at);

-- Set up RLS
ALTER TABLE public.gmail_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workspace gmail sync logs" 
    ON public.gmail_sync_log FOR SELECT 
    USING (
        workspace_id IN (
            SELECT workspace_id 
            FROM public.cohost_workspace_members 
            WHERE user_id = auth.uid()
        )
    );
