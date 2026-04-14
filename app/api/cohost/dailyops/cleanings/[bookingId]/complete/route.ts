import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithWorkspace } from '@/lib/supabase/authServer';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const { user, workspaceId } = await getCurrentUserWithWorkspace();
  if (!user || !workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createCohostServiceClient();

  // Verify caller is active member
  const { data: member } = await service
    .from('cohost_workspace_members')
    .select('role, is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member?.is_active) {
    return NextResponse.json({ error: 'Inactive member' }, { status: 403 });
  }

  // Verify booking belongs to this workspace and is not cancelled
  const { data: booking } = await service
    .from('bookings')
    .select('id, workspace_id, property_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking || booking.workspace_id !== workspaceId) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Booking is cancelled' }, { status: 400 });
  }

  // For cleaners: verify they have access to this property
  if (member.role === 'cleaner') {
    const { data: propAccess } = await service
      .from('cohost_user_properties')
      .select('id')
      .eq('user_id', user.id)
      .eq('property_id', booking.property_id)
      .single();
    if (!propAccess) {
      return NextResponse.json({ error: 'No access to this property' }, { status: 403 });
    }
  }

  // Parse optional hours/expense fields from body
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const hoursWorked: number | null = body.hours_worked ? parseFloat(body.hours_worked) : null;
  const extraAmount: number | null = body.extra_expense_amount ? parseFloat(body.extra_expense_amount) : null;
  const extraDesc: string | null = body.extra_expense_description?.trim() || null;
  const note: string | null = body.completion_note?.trim() || null;

  // Look up caller's hourly pay rate (from team_pay_rates)
  let hourlyRate: number | null = null;
  if (hoursWorked !== null) {
    const { data: payRate } = await service
      .from('team_pay_rates')
      .select('hourly_rate')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();
    hourlyRate = payRate?.hourly_rate ?? null;
  }

  // Calculate amount owed: (hours × rate) + extra expenses
  let calculatedAmount: number | null = null;
  if (hoursWorked !== null && hourlyRate !== null) {
    calculatedAmount = Math.round((hoursWorked * hourlyRate + (extraAmount ?? 0)) * 100) / 100;
  } else if (extraAmount !== null) {
    calculatedAmount = extraAmount;
  }

  const paymentStatus = (hoursWorked !== null || extraAmount !== null) ? 'pending_payment' : null;

  // Upsert completion record
  const { error } = await service
    .from('cleaning_completions')
    .upsert(
      {
        booking_id: bookingId,
        workspace_id: workspaceId,
        completed_by_user_id: user.id,
        completed_at: new Date().toISOString(),
        hours_worked: hoursWorked,
        calculated_amount_owed: calculatedAmount,
        extra_expense_amount: extraAmount,
        extra_expense_description: extraDesc,
        completion_note: note,
        payment_status: paymentStatus,
      },
      { onConflict: 'booking_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
