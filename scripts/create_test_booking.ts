import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function createTestBooking() {
  const propertyId = '7208a26d-dcfe-4f63-a2e2-3c789cc58567';
  const workspaceId = '1188717b-61e1-48fc-8ba5-20242c01a0df';
  
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      property_id: propertyId,
      workspace_id: workspaceId,
      check_in: '2026-04-06',
      check_out: '2026-04-09',
      guest_name: 'TEST GUEST (CANCELLATION TEST)',
      status: 'confirmed',
      source: 'direct',
      source_type: 'direct',
      is_active: true,
      total_price: 50000, // $500.00
      guest_count: 2,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating booking:', error);
    return;
  }
  console.log('Test booking created:', data.id);
}

createTestBooking();
