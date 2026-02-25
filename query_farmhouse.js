const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigate() {
  // 1. Get Farmhouse property ID
  const { data: props, error: pErr } = await supabase
    .from('cohost_properties')
    .select('id, name')
    .ilike('name', '%Farmhouse%');

  if (pErr) { console.error('Error fetching property:', pErr); return; }
  if (!props || props.length === 0) { console.error('Farmhouse property not found'); return; }
  
  const farmhouseId = props[0].id;
  console.log(`Found Farmhouse property: ${props[0].name} (ID: ${farmhouseId})`);

  // 2. Query bookings
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, property_id, source_feed_id, external_uid, source_type, created_at, is_active, check_in, check_out, guest_name')
    .eq('property_id', farmhouseId);

  if (bErr) { console.error('Error fetching bookings:', bErr); return; }

  // 3. Find duplicates
  const grouped = {};
  for (const b of bookings) {
    const key = `${b.check_in}_${b.check_out}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(b);
  }

  const duplicates = Object.values(grouped).filter(g => g.length > 1);
  
  console.log(`\nFound ${duplicates.length} sets of duplicate bookings by date.\n`);
  
  for (let i = 0; i < duplicates.length; i++) {
    console.log(`--- Duplicate Set ${i + 1} for dates: ${duplicates[i][0].check_in} to ${duplicates[i][0].check_out} ---`);
    for (const b of duplicates[i]) {
      console.log(`  - ID: ${b.id}`);
      console.log(`    Source Feed: ${b.source_feed_id}`);
      console.log(`    External UID: ${b.external_uid}`);
      console.log(`    Source Type: ${b.source_type}`);
      console.log(`    Guest Name: ${b.guest_name}`);
      console.log(`    Created At: ${b.created_at}`);
      console.log(`    Active: ${b.is_active}`);
      console.log('');
    }
  }
}

investigate();
