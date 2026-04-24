import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// ─── GET: return the current user's host profile ──────────────────────────────
// Only needs the user ID — no workspace lookup needed.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  const { data: profile, error } = await service
    .from('host_profiles')
    .select('first_name, last_name, business_name, phone, logo_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    email: user.email,
    first_name: profile?.first_name ?? null,
    last_name: profile?.last_name ?? null,
    business_name: profile?.business_name ?? null,
    phone: profile?.phone ?? null,
    logo_url: profile?.logo_url ?? null,
  });
}

// ─── PUT: save host profile + update workspace display name ───────────────────
// Body: { first_name, last_name, business_name, phone, logo_url }
export async function PUT(request: NextRequest) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  const body = await request.json();
  const { first_name, last_name, business_name, phone, logo_url } = body;

  const { error } = await service
    .from('host_profiles')
    .upsert(
      {
        user_id: user.id,
        workspace_id: workspaceId,
        first_name: first_name?.trim() || null,
        last_name: last_name?.trim() || null,
        business_name: business_name?.trim() || null,
        phone: phone?.trim() || null,
        logo_url: logo_url || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Derive the workspace display name:
  //   business_name  → use as-is  (e.g. "Lakeside Properties")
  //   first_name     → "[First]'s Workspace"
  //   fallback       → leave workspace name unchanged
  const workspaceName = business_name?.trim()
    ? business_name.trim()
    : first_name?.trim()
    ? `${first_name.trim()}'s Workspace`
    : null;

  if (workspaceName) {
    await service
      .from('cohost_workspaces')
      .update({ name: workspaceName })
      .eq('id', workspaceId);
  }

  return NextResponse.json({ success: true, workspace_name: workspaceName });
}
