import { SupabaseClient } from '@supabase/supabase-js';

export interface CreateDirectBookingParams {
  propertyId: string;
  workspaceId: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCount: number;
  totalPrice: number;
  stripePaymentIntentId: string;
}

/**
 * Creates a direct booking in the database.
 * This should only be called from the Stripe webhook success handler!
 */
export async function createDirectBooking(
  supabase: SupabaseClient,
  params: CreateDirectBookingParams
) {
  const {
    propertyId,
    workspaceId,
    checkIn,
    checkOut,
    guestName,
    guestEmail,
    guestPhone,
    guestCount,
    totalPrice,
    stripePaymentIntentId,
  } = params;
  
  // Generate a unique external_uid for direct bookings using native crypto
  const externalUid = `direct-${crypto.randomUUID()}`;
  
  // Create the booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      workspace_id: workspaceId,
      property_id: propertyId,
      guest_name: guestName,
      check_in: `${checkIn}T12:00:00Z`,
      check_out: `${checkOut}T12:00:00Z`,
      external_uid: externalUid,
      source: 'direct',
      status: 'confirmed',
      is_active: true,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      total_price: totalPrice,
      stripe_payment_intent_id: stripePaymentIntentId,
      rental_agreement_accepted_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to create booking:', error);
    throw new Error(`Failed to create booking: ${error.message}`);
  }
  
  return booking;
}

/**
 * Deletes a booking hold by session ID.
 */
export async function deleteHold(
  supabase: SupabaseClient,
  sessionId: string
) {
  const { error } = await supabase
    .from('booking_holds')
    .delete()
    .eq('session_id', sessionId);
    
  if (error) {
    console.warn(`Failed to delete hold ${sessionId}:`, error.message);
  }
}
