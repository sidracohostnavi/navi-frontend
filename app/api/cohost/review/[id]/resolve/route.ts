import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type RouteContext = {
    params: Promise<{ id: string }>;
};

/**
 * POST /api/cohost/review/[id]/resolve
 * 
 * Resolve a review item by assigning it to a property.
 * Creates a new booking ONLY if no existing booking matches.
 */
export async function POST(request: Request, context: RouteContext) {
    try {
        const supabase = await createClient();
        const { id: reviewItemId } = await context.params;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { property_id, action } = await request.json();

        // Handle dismiss action
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

        // For assign action, property_id is required
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

        // 4. Extract booking data
        const extracted = reviewItem.extracted_data || {};
        const confirmationCode = extracted.confirmation_code;
        const checkIn = extracted.check_in;
        const checkOut = extracted.check_out;
        const guestName = extracted.guest_name || 'Guest';
        const guestCount = extracted.guest_count || 1;

        if (!checkIn || !checkOut) {
            return NextResponse.json({ error: 'Invalid review item: missing dates' }, { status: 400 });
        }

        // 5. Check for existing booking with same confirmation code + property
        if (confirmationCode) {
            const { data: existingBooking } = await supabase
                .from('bookings')
                .select('id')
                .eq('property_id', property_id)
                .eq('reservation_code', confirmationCode)
                .single();

            if (existingBooking) {
                // Mark as resolved since booking already exists
                await supabase
                    .from('enrichment_review_items')
                    .update({
                        status: 'resolved',
                        resolved_at: new Date().toISOString(),
                        resolved_by: user.id
                    })
                    .eq('id', reviewItemId);

                return NextResponse.json({
                    success: true,
                    action: 'already_exists',
                    booking_id: existingBooking.id
                });
            }
        }

        // 6. Create new booking (parsed guest name)
        const nameParts = guestName.split(' ');
        const firstName = nameParts[0];
        const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1].replace('.', '') : '';

        const { data: newBooking, error: insertError } = await supabase
            .from('bookings')
            .insert({
                workspace_id: reviewItem.workspace_id,
                property_id: property_id,
                source_type: 'email',
                external_uid: `email-${reviewItemId}`,
                reservation_code: confirmationCode || null,
                check_in: new Date(checkIn).toISOString(),
                check_out: new Date(checkOut).toISOString(),
                guest_name: guestName,
                guest_count: guestCount,
                guest_first_name: firstName,
                guest_last_initial: lastInitial,
                status: 'confirmed',
                platform: 'Airbnb',
                is_active: true,
                raw_data: {
                    resolved_from_review: reviewItemId,
                    original_extracted_data: extracted
                }
            })
            .select()
            .single();

        if (insertError) {
            console.error('[ResolveReview] Insert error:', insertError);
            return NextResponse.json({ error: 'Failed to create booking: ' + insertError.message }, { status: 500 });
        }

        // 7. Mark review item as resolved
        await supabase
            .from('enrichment_review_items')
            .update({
                status: 'resolved',
                resolved_at: new Date().toISOString(),
                resolved_by: user.id
            })
            .eq('id', reviewItemId);

        console.log(`[ResolveReview] Created booking ${newBooking.id} for property ${property_id}`);

        return NextResponse.json({
            success: true,
            action: 'created',
            booking_id: newBooking.id
        });

    } catch (err: any) {
        console.error('[ResolveReview] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
