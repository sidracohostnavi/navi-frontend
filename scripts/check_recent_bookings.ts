import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkRecentBookings() {
  const propertyIds = [
    '7208a26d-dcfe-4f63-a2e2-3c789cc58567',
    'b7435d18-de10-4c8a-ab1e-90ac6ef5fe1f'
  ];

  for (const id of propertyIds) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, created_at, guestName')
      .eq('propertyId', id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`Error for ${id}:`, error);
      continue;
    }
    console.log(`Recent booking for ${id}:`, data?.[0] || 'None');
  }
}

checkRecentBookings();
      .limit(1);

if (error) {
  console.error(`Error for ${id}:`, error);
  continue;
}
console.log(`Recent booking for ${id}:`, data?.[0] || 'None');
  }
}

checkRecentBookings();
