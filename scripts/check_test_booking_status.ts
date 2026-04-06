import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkBookingStatus() {
  const bookingId = '6a7c51fd-75fe-4e02-876a-6cd136c0d12e';
  
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, is_active, cancelled_at, refund_amount')
    .eq('id', bookingId)
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Booking status:', JSON.stringify(data, null, 2));
}

checkBookingStatus();
