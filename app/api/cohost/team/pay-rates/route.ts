import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

// ─── GET: return all team members with their hourly rates ─────────────────────
export async function GET() {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  // Only owner/admin can view pay rates
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active || !['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all active members
  const { data: members } = await service
    .from('cohost_workspace_members')
    .select('user_id, role, role_label, is_active')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  // Get existing pay rates
  const { data: rates } = await service
    .from('team_pay_rates')
    .select('user_id, hourly_rate')
    .eq('workspace_id', workspaceId);

  const rateMap = new Map((rates || []).map((r: any) => [r.user_id, r.hourly_rate]));

  // Resolve emails
  const result = await Promise.all(
    (members || [])
      .filter((m: any) => m.role !== 'owner')
      .map(async (m: any) => {
        const { data } = await service.auth.admin.getUserById(m.user_id);
        return {
          user_id: m.user_id,
          email: data.user?.email || null,
          role: m.role,
          role_label: m.role_label,
          hourly_rate: rateMap.has(m.user_id) ? parseFloat(rateMap.get(m.user_id)) : 0,
        };
      })
  );

  return NextResponse.json({ members: result });
}

// ─── PUT: set or update hourly rate for a team member ─────────────────────────
// Body: { user_id: string, hourly_rate: number }
export async function PUT(request: NextRequest) {
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  // Only owner/admin can set pay rates
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active || !['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { user_id, hourly_rate } = body;

  if (!user_id || hourly_rate === undefined || hourly_rate === null) {
    return NextResponse.json({ error: 'user_id and hourly_rate are required' }, { status: 400 });
  }

  const rate = parseFloat(hourly_rate);
  if (isNaN(rate) || rate < 0) {
    return NextResponse.json({ error: 'Invalid hourly_rate' }, { status: 400 });
  }

  // Verify target is an active member of this workspace
  const { data: targetMember } = await service
    .from('cohost_workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user_id)
    .eq('is_active', true)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: 'User not found in workspace' }, { status: 404 });
  }

  // Upsert pay rate
  const { data: payRate, error } = await service
    .from('team_pay_rates')
    .upsert({
      workspace_id: workspaceId,
      user_id,
      hourly_rate: rate,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }, { onConflict: 'workspace_id,user_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ payRate });
}
