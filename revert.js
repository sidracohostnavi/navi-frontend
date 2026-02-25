const fs = require('fs');

const routePath = 'app/api/cohost/calendar/route.ts';
const routeStr = `import { NextRequest, NextResponse } from 'next/server';
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
      'manually_resolved_at'
    ].join(','))
    .eq('is_active', true)
    .lt('check_in', end)
    .gt('check_out', start)
    .in('workspace_id', allowedWorkspaces);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter by property access (before enrichment)
  const workspacesWithRestrictions = new Set(propertyRestrictions.keys());
  const filteredBookings = ((bookings || []) as any[]).filter((b: any) => {
    if (workspacesWithRestrictions.has(b.workspace_id)) {
      const allowed = propertyRestrictions.get(b.workspace_id);
      if (!allowed?.has(b.property_id)) return false;
    }
    return true;
  });


  // ─── SERVER-SIDE ENRICHMENT ──────────────────────────────────────────
  // Merges reservation_facts into bookings BEFORE permission masking.
  // This ensures cleaners receive enriched guest_count (for broom icon)
  // even though guest_name will be masked afterwards.
  if (filteredBookings.length > 0) {
    // 1. Get connection_ids for these workspaces
    const { data: wsConnections } = await service
      .from('connections')
      .select('id')
      .in('workspace_id', allowedWorkspaces);

    const connectionIds = (wsConnections || []).map((c: any) => c.id);

    if (connectionIds.length > 0) {
      // 2. Fetch reservation_facts for those connections in the date window
      const { data: facts } = await service
        .from('reservation_facts')
        .select('id, connection_id, check_in, check_out, guest_name, guest_count')
        .in('connection_id', connectionIds);

      if (facts && facts.length > 0) {
        // 3. Match facts → bookings by ±1 day date tolerance
        //    Rules:
        //    - 0 candidates: no enrichment (keep booking defaults)
        //    - 1 candidate:  enrich guest_name + guest_count
        //    - >1 candidates: ambiguous — do NOT enrich (no guessing)
        const dateDiffDays = (a: string, b: string): number => {
          const msPerDay = 86400000;
          const da = new Date(a.split('T')[0] + 'T00:00:00Z').getTime();
          const db = new Date(b.split('T')[0] + 'T00:00:00Z').getTime();
          return Math.abs(da - db) / msPerDay;
        };

        for (const booking of filteredBookings) {
          // Skip manually resolved bookings — human override takes priority
          if (booking.manually_resolved_at) continue;

          const candidates = facts.filter((f: any) =>
            f.check_in && f.check_out &&
            dateDiffDays(f.check_in, booking.check_in) <= 1 &&
            dateDiffDays(f.check_out, booking.check_out) <= 1
          );

          if (candidates.length === 1) {
            // Exactly 1 match — safe to enrich
            const fact = candidates[0];
            if (fact.guest_name && fact.guest_name !== 'Guest' && fact.guest_name !== 'Reserved') {
              booking.guest_name = fact.guest_name;
              // Derive first/last initial for display consistency
              const parts = fact.guest_name.split(' ');
              booking.guest_first_name = parts[0] || null;
              booking.guest_last_initial = parts.length > 1 ? (parts[parts.length - 1]?.[0] || null) : null;
            }
            if (fact.guest_count != null) {
              booking.guest_count = fact.guest_count;
            }
            // Store the matched connection_id for color/label resolution on the client
            booking.matched_connection_id = fact.connection_id;
          }
          // >1 candidates or 0: no enrichment — booking keeps its original values
        }
      }
    }
  }
  // ─── END ENRICHMENT ─────────────────────────────────────────────────

  // Permission masking (AFTER enrichment so enriched values get masked for cleaners)
  const permsByWorkspace = new Map(
    (allowedMemberships as any[]).map((m: any) => [m.workspace_id, m])
  );

  const masked = filteredBookings.map((b: any) => {
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

  // ─── PHASE 2: GENERATE CLEANING BUFFERS ─────────────────────────────

  // 1. Fetch property policies for all property_ids in the returned bookings
  const allPropertyIds = Array.from(new Set(masked.map((b: any) => b.property_id)));
  let policyMap = new Map<string, any>();
  if (allPropertyIds.length > 0) {
    const { data: propertiesPolicies } = await service
      .from('cohost_properties')
      .select('id, cleaning_pre_days, cleaning_post_days')
      .in('id', allPropertyIds);

    if (propertiesPolicies) {
      policyMap = new Map(propertiesPolicies.map((p: any) => [p.id, p]));
    }
  }

  // 2. Build a booked-day index per property using booking occupancy [check_in, check_out)
  const bookedDaysByProperty = new Map<string, Set<string>>();

  const addDaysToIso = (iso: string, days: number) => {
    // Ensure we are working with pure YYYY-MM-DD
    const dateStr = iso.split('T')[0];
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  };

  const isHold = (b: any) => {
    if (!!b.matched_connection_id || !!b.manual_connection_id || !!b.manually_resolved_at) return false;
    if (!b.guest_name) return true;
    const gn = b.guest_name.toLowerCase();
    return ['guest', 'reserved', 'reservation', 'blocked', 'not available', 'unavailable', 'closed period', 'airbnb (not available)'].includes(gn);
  };

  masked.forEach((b: any) => {
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

  masked.forEach((b: any) => {
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
      const key = \`\${b.property_id}|\${dt}\`;
      if (propSet && propSet.has(dt)) continue;
      if (cleaningSet.has(key)) continue;

      cleaningSet.add(key);
      cleaningItems.push({
        type: 'cleaning',
        id: \`cleaning:\${key}\`,
        property_id: b.property_id,
        check_in: dt + 'T00:00:00Z',
        check_out: addDaysToIso(dt, 1) + 'T00:00:00Z',
        all_day: true
      });
    }

    // Post: dates check_out ... check_out + (post - 1)
    for (let i = 0; i < postDays; i++) {
      const dt = addDaysToIso(checkOutStr, i);
      const key = \`\${b.property_id}|\${dt}\`;
      if (propSet && propSet.has(dt)) continue;
      if (cleaningSet.has(key)) continue;

      cleaningSet.add(key);
      cleaningItems.push({
        type: 'cleaning',
        id: \`cleaning:\${key}\`,
        property_id: b.property_id,
        check_in: dt + 'T00:00:00Z',
        check_out: addDaysToIso(dt, 1) + 'T00:00:00Z',
        all_day: true
      });
    }
  });

  const finalBookings = masked.filter((b: any) => {
    // Is it an iCal hold?
    // If it's a real booking, never suppress it.
    if (!isHold(b)) return true;

    const checkInStr = b.check_in.split('T')[0];
    const checkOutStr = b.check_out.split('T')[0];

    let isEntirelyCovered = true;
    let curr = checkInStr;
    let count = 0;
    while (curr < checkOutStr && count < 365) {
      if (!cleaningSet.has(\`\${b.property_id}|\${curr}\`)) {
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

  const calendarItems = [
    ...finalBookings.map((b: any) => ({ ...b, type: 'booking' })),
    ...cleaningItems
  ];

  return NextResponse.json({
    calendar_items: calendarItems,
    property_policies: Object.fromEntries(policyMap)
  });
}
`;

fs.writeFileSync(routePath, routeStr, 'utf8');

const clientPath = 'app/cohost/calendar/CalendarClient.tsx';
let clientStr = fs.readFileSync(clientPath, 'utf8');

clientStr = clientStr.replace(
  /gridColumn: \`\${start \+ 2} \/ span \${booking\.type === 'cleaning' \? span : \(policyEnabled \? span : span \+ 1\)}\`,/g,
  `gridColumn: \`\${start + 2} / span \${booking.type === 'cleaning' ? span : span + 1}\`,`
);

clientStr = clientStr.replace(
  /\{\/\* Booking bar: geometry splits based on policyEnabled \*\/\}[\s\S]*?left: policyEnabled \? 0 : \(CELL_WIDTH \/ 2\),[\s\S]*?right: policyEnabled \? 0 :/g,
  `{/* Booking bar: starts halfway into check-in cell, extends ~10% into checkout cell */}
                            <div
                              className="absolute"
                              style={{
                                left: CELL_WIDTH / 2,
                                right:`
);

fs.writeFileSync(clientPath, clientStr, 'utf8');
console.log('Revert complete');
