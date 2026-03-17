const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('Checking for booking_holds table...');
  const { data: holdsTable, error: holdsError } = await supabase
    .from('booking_holds')
    .select('*')
    .limit(1);
    
  if (holdsError) {
    console.error('Error finding booking_holds Table:', holdsError.message);
  } else {
    console.log('✅ TABLE booking_holds exists!');
  }

  console.log('\nChecking for new columns in cohost_properties...');
  const { data: props, error: propsError } = await supabase
    .from('cohost_properties')
    .select('slug, direct_booking_enabled, cleaning_fee, nightly_rate')
    .limit(1);

  if (propsError) {
    if (propsError.message.includes('column')) {
        console.error('❌ Columns not found in cohost_properties:', propsError.message);
    } else {
        console.error('Error fetching cohost_properties:', propsError.message);
    }
  } else {
    console.log('✅ Columns found in cohost_properties!');
  }

  console.log('\nChecking for new columns in cohost_workspaces...');
  const { data: workspaces, error: workspacesError } = await supabase
    .from('cohost_workspaces')
    .select('stripe_account_id, stripe_onboarding_complete')
    .limit(1);

  if (workspacesError) {
      if (workspacesError.message.includes('column')) {
        console.error('❌ Columns not found in cohost_workspaces:', workspacesError.message);
      } else {
        console.error('Error fetching cohost_workspaces:', workspacesError.message);
      }
  } else {
    console.log('✅ Columns found in cohost_workspaces!');
  }

   console.log('\nChecking for new columns in bookings...');
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('source, payment_link_token, stripe_payment_intent_id')
    .limit(1);

  if (bookingsError) {
      if (bookingsError.message.includes('column')) {
        console.error('❌ Columns not found in bookings:', bookingsError.message);
      } else {
        console.error('Error fetching bookings:', bookingsError.message);
      }
  } else {
    console.log('✅ Columns found in bookings!');
  }
}

check();
