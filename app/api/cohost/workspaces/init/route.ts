// app/api/cohost/workspaces/init/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspaceExists } from '@/lib/services/workspace-service';

export async function POST(request: Request) {
  try {
    const supabase = await createClient(); // assuming await createClient() is needed in setup
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[workspaces-init] Auth Error:', userError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, isNew, error } = await ensureWorkspaceExists(user.id, user.email);

    if (error || !workspaceId) {
      console.error('[workspaces-init] Initialization error:', error);
      return NextResponse.json({ error: 'Failed to initialize workspace' }, { status: 500 });
    }

    return NextResponse.json({ success: true, workspaceId, isNew });
  } catch (err: any) {
    console.error('[workspaces-init] Exception:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
