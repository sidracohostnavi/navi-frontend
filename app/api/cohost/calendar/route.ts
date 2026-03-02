import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'Missing range' }, { status: 400 });

  const debugBookingId = url.searchParams.get('debug_booking_id');

  // Use service client for data queries (bypasses RLS for reliable team access)
  const service = createCohostServiceClient();

  const { data: memberships, error: memError } = await service
    .from('cohost_workspace_members')
    .select('workspace_id, can_view_calendar, can_view_guest_name, can_view_guest_count, can_view_booking_notes, can_view_contact_info, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (memError) return NextResponse.json({ error: memError.message }, { status: 500 });

  const allowedMemberships = (memberships || []).filter(m => m.can_view_calendar !== false);
  const allowedWorkspaces = allowedMemberships.map(m => m.workspace_id);

  if (allowedWorkspaces.length === 0) {
    return NextResponse.json({ bookings: [] });
  }

  // Fetch property assignments
  const { data: userProperties } = await service
    .from('cohost_user_properties')
    .select('property_id, workspace_id')
    .eq('user_id', user.id)
    .in('workspace_id', allowedWorkspaces);

  // Group allowed properties by workspace
  // If a workspace has NO entries here, it means "All Properties Allowed" (default)
  // If it has entries, it means "Restricted to these properties"
  const propertyRestrictions = new Map<string, Set<string>>();
  if (userProperties && userProperties.length > 0) {
    userProperties.forEach((up: any) => {
      if (!propertyRestrictions.has(up.workspace_id)) {
        propertyRestrictions.set(up.workspace_id, new Set());
      }
      propertyRestrictions.get(up.workspace_id)!.add(up.property_id);
    });
  }

  const { data: bookings, error } = await service
    .from('bookings')
    .select([
      'id',
      'workspace_id',
      'property_id',
      'check_in',
      'check_out',
      'status',
      'source_type',
      'platform',
      'guest_name',
      'guest_first_name',
      'guest_last_initial',
      'guest_count',
      'needs_review',
      'source_feed_id',
      'created_at',
      'manual_connection_id',
      'manual_guest_name',
      'manual_guest_count',
      'manual_notes',
      'manually_resolved_at',
      'raw_data'
    ].join(','))
    .eq('is_active', true)
    .lt('check_in', end)
    .gt('check_out', start)
    .in('workspace_id', allowedWorkspaces);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter by property access (before enrichment)
  const workspacesWithRestrictions = new Set(propertyRestrictions.keys());
  let filteredBookings = ((bookings || []) as any[]).filter((b: any) => {
    if (workspacesWithRestrictions.has(b.workspace_id)) {
      const allowed = propertyRestrictions.get(b.workspace_id);
      if (!allowed?.has(b.property_id)) return false;
    }
    return true;
  });


  // ─── SERVER-SIDE ENRICHMENT (Deterministic Link Only) ────────────────
  // Links matched properties and guest counts using strict fact IDs.
  // NEVER mutates guest_name or matches by date.
  if (filteredBookings.length > 0) {
    const factIdsToFetch = new Set<string>();

    for (const booking of filteredBookings) {
      // Collect specific fact IDs that were explicitly linked during background processing
      const fromFactId = booking.raw_data?.from_fact_id;
      if (fromFactId) {
        factIdsToFetch.add(fromFactId);
      }
    }

    if (factIdsToFetch.size > 0) {
      const { data: facts } = await service
        .from('reservation_facts')
        .select('id, connection_id, guest_count')
        .in('id', Array.from(factIdsToFetch));

      if (facts && facts.length > 0) {
        const factMap = new Map();
        for (const f of facts) {
          factMap.set(f.id, f);
        }

        for (const booking of filteredBookings) {
          const fromFactId = booking.raw_data?.from_fact_id;
          if (!fromFactId) continue;

          const fact = factMap.get(fromFactId);
          if (fact) {
            // Assign explicitly linked connection for UI colors
            booking.matched_connection_id = fact.connection_id;

            // Only safely augment guest count if booking has default
            if ((booking.guest_count === null || booking.guest_count === 1) && fact.guest_count != null) {
              booking.guest_count = fact.guest_count;
            }
          }
        }
      }
    }

    // Prove Craig source
    const craigTestBooking = filteredBookings.find((b: any) => b.id === '5fc990b4-3807-4b73-81b4-27e23fe2ff47');
    if (craigTestBooking) {
      console.log(`\n[DEBUG-CRAIG] booking_id: ${craigTestBooking.id}`);
      console.log(`[DEBUG-CRAIG] DB guest_name: "${craigTestBooking.guest_name}"`);
      console.log(`[DEBUG-CRAIG] DB raw_data.from_fact_id: ${craigTestBooking.raw_data?.from_fact_id || 'null'}`);
      console.log(`[DEBUG-CRAIG] matched_connection_id: ${craigTestBooking.matched_connection_id || 'null'}\n`);
    }
  }
  // ─── END ENRICHMENT ─────────────────────────────────────────────────

  const addDaysToIso = (iso: string, days: number) => {
    // Ensure we are working with pure YYYY-MM-DD
    const dateStr = iso.split('T')[0];
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  };

  // ─── SUPPRESS COVERED LODGIFY BLOCKS ────────────────────────────────
  const bookingsByPropertyFilters = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropertyFilters.has(b.property_id)) {
      bookingsByPropertyFilters.set(b.property_id, []);
    }
    bookingsByPropertyFilters.get(b.property_id)!.push(b);
  }

  const postLodgifyBookings: any[] = [];

  for (const propertyBookings of bookingsByPropertyFilters.values()) {
    const genericLodgifyBlocks: any[] = [];
    const realBookings: any[] = [];

    for (const b of propertyBookings) {
      if (b.platform === 'Lodgify' && (
        ['Not Available', 'Closed Period'].includes(b.guest_name) ||
        (b.raw_data && ['Not Available', 'Closed Period'].includes(b.raw_data.summary))
      )) {
        genericLodgifyBlocks.push(b);
      } else {
        realBookings.push(b);
      }
    }

    postLodgifyBookings.push(...realBookings);

    for (const genBlock of genericLodgifyBlocks) {
      const gIn = genBlock.check_in.split('T')[0];
      const gOut = genBlock.check_out.split('T')[0];

      const coveredDays = new Set<string>();
      for (const realB of realBookings) {
        const rIn = realB.check_in.split('T')[0];
        const rOut = realB.check_out.split('T')[0];
        let curr = rIn;
        let count = 0;
        while (curr < rOut && count < 365) {
          if (curr >= gIn && curr < gOut) {
            coveredDays.add(curr);
          }
          curr = addDaysToIso(curr, 1);
          count++;
        }
      }

      let isFullyCovered = true;
      let currGen = gIn;
      let countGen = 0;
      while (currGen < gOut && countGen < 365) {
        if (!coveredDays.has(currGen)) {
          isFullyCovered = false;
          break;
        }
        currGen = addDaysToIso(currGen, 1);
        countGen++;
      }

      if (!isFullyCovered) {
        postLodgifyBookings.push(genBlock);
      }
    }
  }

  filteredBookings = postLodgifyBookings;

  // ─── PHASE 2: GENERATE CLEANING BUFFERS ─────────────────────────────

  // 1. Fetch property policies for all property_ids in the returned bookings
  const allPropertyIds = Array.from(new Set(filteredBookings.map((b: any) => b.property_id)));
  let policyMap = new Map<string, any>();
  if (allPropertyIds.length > 0) {
    const { data: propertiesPolicies } = await service
      .from('cohost_properties')
      .select('id, cleaning_pre_days, cleaning_post_days')
      .in('id', allPropertyIds);

    if (propertiesPolicies) {
      if (debugBookingId) {
        const pPolicy = propertiesPolicies.find((p: any) => p.id === '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937');
        console.log(`[DEBUG] Green Cottage policy from DB: ${JSON.stringify(pPolicy)}`);
      }
      policyMap = new Map(propertiesPolicies.map((p: any) => [p.id, p]));
    }
  }

  // 2. Build a booked-day index per property using booking occupancy [check_in, check_out)
  const bookedDaysByProperty = new Map<string, Set<string>>();

  const isHold = (b: any) => {
    if (!!b.matched_connection_id || !!b.manual_connection_id || !!b.manually_resolved_at) return false;
    if (!b.guest_name) return true;
    const gn = b.guest_name.toLowerCase();

    // Substring match for keywords
    const keywords = ['cleaning', 'maintenance', 'hold', 'blocked', 'unavailable', 'reservation', 'reserved'];
    if (keywords.some(k => gn.includes(k))) return true;

    // Exact match for old ones
    return ['guest', 'not available', 'closed period', 'airbnb (not available)'].includes(gn);
  };

  // ─── NEW PHASE: SUPPRESS LODGIFY BUFFERS FOR POLICY-ENABLED PROPERTIES ───
  const finalPreCleaningBookings: any[] = [];

  const bookingsByPropBuffer = new Map<string, any[]>();
  for (const b of filteredBookings) {
    if (!bookingsByPropBuffer.has(b.property_id)) bookingsByPropBuffer.set(b.property_id, []);
    bookingsByPropBuffer.get(b.property_id)!.push(b);
  }

  const isoDate = (d: any) => new Date(d).toISOString().slice(0, 10);

  for (const [propId, propBookings] of bookingsByPropBuffer.entries()) {
    const policy = policyMap.get(propId);

    if (!policy || (policy.cleaning_pre_days === 0 && policy.cleaning_post_days === 0)) {
      finalPreCleaningBookings.push(...propBookings);
      continue;
    }

    const preDays = policy.cleaning_pre_days || 0;
    const postDays = policy.cleaning_post_days || 0;

    const realBookings = propBookings.filter(b => {
      const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
      const isManual = !!b.manual_connection_id || !!b.manually_resolved_at;
      return isEnriched || isManual || !isHold(b);
    });

    for (const b of propBookings) {
      if (b.platform?.trim() === 'Lodgify') {
        const isEnriched = !!(b.raw_data && b.raw_data.enriched_from_fact);
        if (isEnriched) {
          finalPreCleaningBookings.push(b);
          continue;
        }

        const bIn = isoDate(b.check_in);
        const bOut = isoDate(b.check_out);

        // Calculate duration of the Lodgify block in days
        const bInDate = new Date(bIn);
        const bOutDate = new Date(bOut);
        const blockDurationDays = Math.round((bOutDate.getTime() - bInDate.getTime()) / (1000 * 60 * 60 * 24));

        const isBuffer = realBookings.some(real => {
          if (real.id === b.id) return false;

          const rIn = isoDate(real.check_in);
          const rOut = isoDate(real.check_out);

          if (preDays > 0 && blockDurationDays === preDays) {
            const expectedPreIn = addDaysToIso(rIn, -preDays);
            if (bIn === expectedPreIn && bOut === rIn) return true;
          }

          if (postDays > 0 && blockDurationDays === postDays) {
            const expectedPostOut = addDaysToIso(rOut, postDays);
            if (bIn === rOut && bOut === expectedPostOut) return true;
          }

          return false;
        });

        if (isBuffer) {
          continue;
        }
      }

      finalPreCleaningBookings.push(b);
    }
  }

  filteredBookings = finalPreCleaningBookings;

  filteredBookings.forEach((b: any) => {
    // Only real or confirmed bookings create hard blocks that prevent cleaning generation
    if (isHold(b)) return;

    const checkInStr = b.check_in.split('T')[0];
    const checkOutStr = b.check_out.split('T')[0];
    if (!bookedDaysByProperty.has(b.property_id)) {
      bookedDaysByProperty.set(b.property_id, new Set());
    }
    const set = bookedDaysByProperty.get(b.property_id)!;

    let curr = checkInStr;
    let count = 0;
    while (curr < checkOutStr && count < 365) {
      set.add(curr);
      curr = addDaysToIso(curr, 1);
      count++;
    }
  });

  // 3. Generate cleaning days
  const cleaningItems: any[] = [];
  const cleaningSet = new Set<string>(); // property_id|YYYY-MM-DD

  filteredBookings.forEach((b: any) => {
    // Only generate cleaning blocks around real/confirmed bookings
    if (isHold(b)) return;

    const policy = policyMap.get(b.property_id);
    if (!policy) return;

    const preDays = policy.cleaning_pre_days || 0;
    const postDays = policy.cleaning_post_days || 0;

    // Only generate if the property actually has a policy enabled
    if (preDays === 0 && postDays === 0) return;

    const propSet = bookedDaysByProperty.get(b.property_id);

    const checkInStr = b.check_in.split('T')[0];
    const checkOutStr = b.check_out.split('T')[0];

    // Pre: dates check_in - pre ... check_in - 1
    for (let i = preDays; i >= 1; i--) {
      const dt = addDaysToIso(checkInStr, -i);
      const key = `${b.property_id}|${dt}`;
      if (propSet && propSet.has(dt)) continue;
      if (cleaningSet.has(key)) continue;

      cleaningSet.add(key);
      cleaningItems.push({
        type: 'cleaning',
        id: `cleaning:${key}`,
        property_id: b.property_id,
        check_in: dt + 'T00:00:00Z',
        check_out: addDaysToIso(dt, 1) + 'T00:00:00Z',
        all_day: true
      });
    }

    // Post: dates check_out ... check_out + (post - 1)
    for (let i = 0; i < postDays; i++) {
      const dt = addDaysToIso(checkOutStr, i);
      const key = `${b.property_id}|${dt}`;
      if (propSet && propSet.has(dt)) continue;
      if (cleaningSet.has(key)) continue;

      cleaningSet.add(key);
      cleaningItems.push({
        type: 'cleaning',
        id: `cleaning:${key}`,
        property_id: b.property_id,
        check_in: dt + 'T00:00:00Z',
        check_out: addDaysToIso(dt, 1) + 'T00:00:00Z',
        all_day: true
      });
    }
  });

  const finalBookings = filteredBookings.filter((b: any) => {
    // Is it an iCal hold?
    // If it's a real booking, never suppress it.
    if (!isHold(b)) return true;

    // Let Lodgify blocks survive since early logic already stripped buffers
    if (b.platform?.trim() === 'Lodgify') return true;

    const policy = policyMap.get(b.property_id);
    const policyEnabled = !!(policy && (policy.cleaning_pre_days > 0 || policy.cleaning_post_days > 0));

    if (policyEnabled) {
      return false; // Suppress holds outright for policy-enabled properties
    }

    const checkInStr = b.check_in.split('T')[0];
    const checkOutStr = b.check_out.split('T')[0];

    let isEntirelyCovered = true;
    let curr = checkInStr;
    let count = 0;
    while (curr < checkOutStr && count < 365) {
      if (!cleaningSet.has(`${b.property_id}|${curr}`)) {
        isEntirelyCovered = false;
        break;
      }
      curr = addDaysToIso(curr, 1);
      count++;
    }

    if (count > 0 && isEntirelyCovered) {
      return false; // Suppress this iCal block
    }

    return true;
  });

  // Permission masking (AFTER final booking filtering)
  const permsByWorkspace = new Map(
    (allowedMemberships as any[]).map((m: any) => [m.workspace_id, m])
  );

  const masked = finalBookings.map((b: any) => {
    const perms = permsByWorkspace.get(b.workspace_id);
    const canViewGuestName = perms?.can_view_guest_name !== false;
    const canViewGuestCount = perms?.can_view_guest_count !== false;
    const canViewNotes = perms?.can_view_booking_notes !== false;

    return {
      ...b,
      guest_name: canViewGuestName ? b.guest_name : null,
      guest_first_name: canViewGuestName ? b.guest_first_name : null,
      guest_last_initial: canViewGuestName ? b.guest_last_initial : null,
      guest_count: canViewGuestCount ? b.guest_count : null,
      manual_notes: canViewNotes ? b.manual_notes : null,
    };
  });

  const calendarItems = [
    ...masked.map((b: any) => ({ ...b, type: 'booking' })),
    ...cleaningItems
  ];

  return NextResponse.json({
    calendar_items: calendarItems,
    property_policies: Object.fromEntries(policyMap)
  });
}
