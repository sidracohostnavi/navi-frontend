import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('[HoldCleanup] No valid auth header - proceeding but consider adding CRON_SECRET for security');
  }

  console.log('[HoldCleanup] Starting hold cleanup...');

  // 1. Expire holds past their expiry time
  // Those that are 'pending' (quote sent) and past 'expires_at'
  const { data: expiredHolds, error: expireError } = await supabase
    .from('booking_holds')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (expireError) {
    console.error('[HoldCleanup] Error expiring holds:', expireError);
  } else {
    console.log(`[HoldCleanup] Expired ${expiredHolds?.length || 0} holds`);
  }

  // 2. Supersede holds that overlap with new bookings
  // This is critical after an iCal sync or manual booking creation
  const { data: activeHolds, error: fetchError } = await supabase
    .from('booking_holds')
    .select('id, property_id, check_in, check_out')
    .in('status', ['pending', 'draft']);

  if (fetchError) {
    console.error('[HoldCleanup] Error fetching active holds:', fetchError);
  }

  let supersededCount = 0;

  for (const hold of activeHolds || []) {
    // Check for overlapping active booking in the bookings table
    const { data: overlapping, error: overlapError } = await supabase
      .from('bookings')
      .select('id')
      .eq('property_id', hold.property_id)
      .eq('is_active', true)
      .lt('check_in', hold.check_out)
      .gt('check_out', hold.check_in)
      .limit(1);

    if (overlapError) {
      console.error(`[HoldCleanup] Error checking overlaps for hold ${hold.id}:`, overlapError);
      continue;
    }

    if (overlapping && overlapping.length > 0) {
      // There is a real booking overlapping this hold, so the hold is now invalid
      const { error: updateError } = await supabase
        .from('booking_holds')
        .update({ status: 'superseded' })
        .eq('id', hold.id);
      
      if (updateError) {
        console.error(`[HoldCleanup] Failed to supersede hold ${hold.id}:`, updateError);
      } else {
        supersededCount++;
        console.log(`[HoldCleanup] Superseded hold ${hold.id} due to overlapping booking ${overlapping[0].id}`);
      }
    }
  }

  console.log(`[HoldCleanup] Total superseded during this run: ${supersededCount}`);

  // 3. Clean up very old holds (Delete after 30 days to keep table lean)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: deletedHolds, error: deleteError } = await supabase
    .from('booking_holds')
    .delete()
    .in('status', ['expired', 'cancelled', 'superseded', 'converted'])
    .lt('created_at', thirtyDaysAgo.toISOString())
    .select('id');

  if (deleteError) {
    console.error('[HoldCleanup] Error deleting old holds:', deleteError);
  } else {
    console.log(`[HoldCleanup] Deleted ${deletedHolds?.length || 0} old holds records`);
  }

  return NextResponse.json({
    success: true,
    expired: expiredHolds?.length || 0,
    superseded: supersededCount,
    deleted: deletedHolds?.length || 0,
    timestamp: new Date().toISOString()
  });
}
