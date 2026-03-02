import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type RouteContext = {
    params: Promise<{ id: string }>;
};

/**
 * Matches EmailProcessor.isMaskedGuestName() exactly.
 * A booking is unenriched if its guest_name matches any of these patterns.
 */
function isMaskedGuestName(name: string | null): boolean {
    if (!name) return true;
    const lower = name.toLowerCase();
    if (['guest', 'reserved', 'blocked', 'not available', 'closed period'].includes(lower)) return true;
    if (/(airbnb|vrbo|lodgify|booking\.com|via |expedia)/i.test(name)) return true;
    if (/^[A-Z0-9_-]{6,20}$/.test(name) && /\d/.test(name)) return true;
    if ((name.match(/\*/g) || []).length >= 5) return true;
    return false;
}

/**
 * Derive platform from confirmation code prefix.
 * HM* = Airbnb, B + digits = Lodgify, else = Other
 */
function derivePlatform(confirmationCode: string | null): string {
    if (!confirmationCode) return 'Other';
    if (confirmationCode.startsWith('HM')) return 'Airbnb';
    if (/^B\d/.test(confirmationCode)) return 'Lodgify';
    return 'Other';
}

/**
 * POST /api/cohost/review/[id]/resolve
 * 
 * Resolve a review item by:
 *   1. Finding an unenriched booking on exact dates for the selected property → enrich it
 *   2. If no unenriched booking found → return no_match for manual booking creation
 *   3. Or create a manual booking if action = 'create_manual'
 *   4. Or dismiss if action = 'dismiss'
 */
export async function POST(request: Request, context: RouteContext) {
    try {
        const supabase = await createClient();
        const { id: reviewItemId } = await context.params;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { property_id, action, guest_name, guest_count, check_in, check_out, label_text } = body;

        // ─── DISMISS ─────────────────────────────────────────────────────
        if (action === 'dismiss') {
            const { error: updateError } = await supabase
                .from('enrichment_review_items')
                .update({
                    status: 'dismissed',
                    resolved_at: new Date().toISOString(),
                    resolved_by: user.id
                })
                .eq('id', reviewItemId);

            if (updateError) throw updateError;
            return NextResponse.json({ success: true, action: 'dismissed' });
        }

        // ─── VALIDATE INPUTS ─────────────────────────────────────────────
        if (!property_id) {
            return NextResponse.json({ error: 'Missing property_id' }, { status: 400 });
        }

        // 1. Fetch the review item
        const { data: reviewItem, error: fetchError } = await supabase
            .from('enrichment_review_items')
            .select('*')
            .eq('id', reviewItemId)
            .single();

        if (fetchError || !reviewItem) {
            return NextResponse.json({ error: 'Review item not found' }, { status: 404 });
        }

        // IDEMPOTENCY: If already resolved, return success without re-processing
        if (reviewItem.status === 'resolved') {
            return NextResponse.json({ success: true, action: 'already_resolved' });
        }

        // 2. Validate user owns the workspace
        const { data: membership } = await supabase
            .from('cohost_workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .eq('workspace_id', reviewItem.workspace_id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // 3. Validate user owns the target property
        const { data: property } = await supabase
            .from('cohost_properties')
            .select('id, workspace_id')
            .eq('id', property_id)
            .eq('workspace_id', reviewItem.workspace_id)
            .single();

        if (!property) {
            return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
        }

        // 4. Extract data (allow overrides from editable fields)
        const extracted = reviewItem.extracted_data || {};
        const finalGuestName = guest_name || extracted.guest_name || 'Guest';
        const finalGuestCount = guest_count ?? extracted.guest_count ?? 1;
        const finalCheckIn = check_in || extracted.check_in;
        const finalCheckOut = check_out || extracted.check_out;
        const confirmationCode = extracted.confirmation_code;
        const platform = derivePlatform(confirmationCode);

        if (!finalCheckIn || !finalCheckOut) {
            return NextResponse.json({ error: 'Invalid review item: missing dates' }, { status: 400 });
        }

        // 5. Fetch connection info for label (name + color)
        const { data: connection } = await supabase
            .from('connections')
            .select('id, name, color')
            .eq('id', reviewItem.connection_id)
            .single();

        const connectionLabelName = connection?.name || null;
        const connectionLabelColor = connection?.color || null;

        // ─── MANUAL BOOKING CREATION ─────────────────────────────────────
        if (action === 'create_manual') {
            // Parse guest name into parts (match enrichBookings pattern)
            const nameParts = finalGuestName.trim().split(/\s+/);
            const firstName = nameParts[0];
            const lastInitial = nameParts.length > 1
                ? nameParts[nameParts.length - 1][0]
                : '';
            const displayName = `${firstName}${lastInitial ? ' ' + lastInitial + '.' : ''}`;

            // Create reservation_fact first (for calendar connection link)
            const { data: newFact, error: factError } = await supabase
                .from('reservation_facts')
                .insert({
                    connection_id: reviewItem.connection_id,
                    source_gmail_message_id: extracted.gmail_message_id || `manual-${reviewItemId}`,
                    check_in: finalCheckIn,
                    check_out: finalCheckOut,
                    guest_name: finalGuestName,
                    guest_count: finalGuestCount,
                    confirmation_code: confirmationCode || null,
                    listing_name: extracted.listing_name || null,
                    confidence: 1.0,
                    raw_data: {
                        source: 'manual_review_assignment',
                        review_item_id: reviewItemId,
                        label_text: label_text || null
                    }
                })
                .select('id')
                .single();

            if (factError) {
                console.error('[ResolveReview] Failed to create reservation_fact:', factError);
                return NextResponse.json({ error: 'Failed to create reservation fact' }, { status: 500 });
            }

            // Insert manual booking
            const { data: newBooking, error: insertError } = await supabase
                .from('bookings')
                .insert({
                    workspace_id: reviewItem.workspace_id,
                    property_id: property_id,
                    source_type: 'manual',
                    external_uid: `manual-${reviewItemId}`,
                    reservation_code: confirmationCode || null,
                    check_in: new Date(finalCheckIn + 'T12:00:00Z').toISOString(),
                    check_out: new Date(finalCheckOut + 'T12:00:00Z').toISOString(),
                    guest_name: displayName,
                    guest_count: finalGuestCount,
                    guest_first_name: firstName,
                    guest_last_initial: lastInitial,
                    platform: label_text || platform,
                    status: 'confirmed',
                    is_active: true,
                    raw_data: {
                        from_fact_id: newFact.id,
                        resolved_from_review: reviewItemId,
                        manual_booking: true,
                        label_text: label_text || null,
                        connection_label_name: connectionLabelName,
                        connection_label_color: connectionLabelColor
                    }
                })
                .select('id')
                .single();

            if (insertError) {
                console.error('[ResolveReview] Manual booking insert error:', insertError);
                return NextResponse.json({ error: 'Failed to create manual booking: ' + insertError.message }, { status: 500 });
            }

            // Mark review item as resolved
            await supabase
                .from('enrichment_review_items')
                .update({
                    status: 'resolved',
                    resolved_at: new Date().toISOString(),
                    resolved_by: user.id
                })
                .eq('id', reviewItemId);

            console.log(`[ResolveReview] Created manual booking ${newBooking.id} for property ${property_id}`);

            return NextResponse.json({
                success: true,
                action: 'manual_created',
                booking_id: newBooking.id
            });
        }

        // ─── STANDARD ASSIGNMENT FLOW ────────────────────────────────────

        // 6. Look for unenriched booking on exact dates for selected property
        const { data: candidateBookings } = await supabase
            .from('bookings')
            .select('id, guest_name, check_in, check_out, raw_data')
            .eq('property_id', property_id)
            .eq('is_active', true);

        // Filter to exact date match + masked guest name
        const unenrichedMatches = (candidateBookings || []).filter((b: any) => {
            const bIn = new Date(b.check_in).toISOString().split('T')[0];
            const bOut = new Date(b.check_out).toISOString().split('T')[0];
            return bIn === finalCheckIn && bOut === finalCheckOut && isMaskedGuestName(b.guest_name);
        });

        // ─── NO MATCH → signal UI for manual booking ────────────────────
        if (unenrichedMatches.length === 0) {
            return NextResponse.json({
                success: false,
                action: 'no_match',
                message: 'No unenriched booking found on those dates for this property.',
                platform: platform
            });
        }

        // ─── MATCH FOUND → enrich the booking ──────────────────────────
        // If multiple unenriched matches, take the first one (user explicitly chose the property)
        const targetBooking = unenrichedMatches[0];

        // Parse guest name (match enrichBookings pattern exactly)
        const nameParts = finalGuestName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastInitial = nameParts.length > 1
            ? nameParts[nameParts.length - 1][0]
            : '';
        const displayName = `${firstName}${lastInitial ? ' ' + lastInitial + '.' : ''}`;

        // Create reservation_fact (for calendar connection link via from_fact_id)
        const { data: newFact, error: factError } = await supabase
            .from('reservation_facts')
            .insert({
                connection_id: reviewItem.connection_id,
                source_gmail_message_id: extracted.gmail_message_id || `review-${reviewItemId}`,
                check_in: finalCheckIn,
                check_out: finalCheckOut,
                guest_name: finalGuestName,
                guest_count: finalGuestCount,
                confirmation_code: confirmationCode || null,
                listing_name: extracted.listing_name || null,
                confidence: 1.0,
                raw_data: {
                    source: 'review_assignment',
                    review_item_id: reviewItemId
                }
            })
            .select('id')
            .single();

        if (factError) {
            console.error('[ResolveReview] Failed to create reservation_fact:', factError);
            return NextResponse.json({ error: 'Failed to create reservation fact' }, { status: 500 });
        }

        // Update booking with guest info (exact enrichBookings field pattern)
        const { error: updateError } = await supabase
            .from('bookings')
            .update({
                guest_name: displayName,
                guest_count: finalGuestCount,
                guest_first_name: firstName,
                guest_last_initial: lastInitial,
                raw_data: {
                    ...targetBooking.raw_data,
                    from_fact_id: newFact.id,
                    enriched_from_review: reviewItemId,
                    enrichment_reason: 'review_assignment',
                    connection_label_name: connectionLabelName,
                    connection_label_color: connectionLabelColor
                }
            })
            .eq('id', targetBooking.id);

        if (updateError) {
            console.error('[ResolveReview] Booking update error:', updateError);
            return NextResponse.json({ error: 'Failed to update booking: ' + updateError.message }, { status: 500 });
        }

        // Mark review item as resolved
        await supabase
            .from('enrichment_review_items')
            .update({
                status: 'resolved',
                resolved_at: new Date().toISOString(),
                resolved_by: user.id
            })
            .eq('id', reviewItemId);

        console.log(`[ResolveReview] Enriched booking ${targetBooking.id} → ${displayName} for property ${property_id}`);

        return NextResponse.json({
            success: true,
            action: 'enriched',
            booking_id: targetBooking.id
        });

    } catch (err: any) {
        console.error('[ResolveReview] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
