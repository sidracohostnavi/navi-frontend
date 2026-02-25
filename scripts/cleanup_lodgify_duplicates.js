const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCleanup() {
    console.log('Starting one-time Lodgify duplicate cleanup for Farmhouse...');

    // 1. Get Farmhouse Property
    const { data: props, error: pErr } = await supabase
        .from('cohost_properties')
        .select('id, name')
        .ilike('name', '%Farmhouse%');

    if (pErr) throw pErr;
    if (!props || props.length === 0) {
        console.log('No Farmhouse property found. Exiting.');
        return;
    }
    const farmhouseId = props[0].id;
    console.log(`Found Property: ${props[0].name} (${farmhouseId})`);

    // 2. Get Lodgify Feed for Farmhouse
    const { data: feeds, error: fErr } = await supabase
        .from('ical_feeds')
        .select('id, source_name, source_type')
        .eq('property_id', farmhouseId)
        .ilike('source_name', '%lodgify%');

    if (fErr) throw fErr;
    if (!feeds || feeds.length === 0) {
        console.log('No Lodgify feed found for Farmhouse. Exiting.');
        return;
    }
    const lodgifyFeedId = feeds[0].id;
    console.log(`Found Lodgify Feed: ${feeds[0].source_name} (${lodgifyFeedId})`);

    // 3. Get Active Bookings for this feed/property
    const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select('id, check_in, check_out, guest_name, created_at, is_active')
        .eq('property_id', farmhouseId)
        .eq('source_feed_id', lodgifyFeedId)
        .eq('is_active', true);

    if (bErr) throw bErr;
    console.log(`Fetched ${bookings.length} active bookings from this feed.`);

    // 4. Group by (check_in_date, check_out_date, guest_name)
    const grouped = {};
    for (const b of bookings) {
        const inDate = (b.check_in || '').split('T')[0];
        const outDate = (b.check_out || '').split('T')[0];
        const name = (b.guest_name || '').trim().toLowerCase();

        const key = `${inDate}_${outDate}_${name}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(b);
    }

    // 5. Find duplicates and deactivate older ones
    let deactivatedCount = 0;

    for (const [key, group] of Object.entries(grouped)) {
        if (group.length > 1) {
            // Sort by created_at descending (newest first)
            group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            const newest = group[0];
            const olderDuplicates = group.slice(1);

            console.log(`Group [${key}] has ${group.length} bookings. Keeping newest (${newest.id}), deactivating ${olderDuplicates.length}...`);

            for (const oldBooking of olderDuplicates) {
                const { error: updErr } = await supabase
                    .from('bookings')
                    .update({ is_active: false })
                    .eq('id', oldBooking.id);

                if (updErr) {
                    console.error(`  Failed to deactivate ${oldBooking.id}:`, updErr);
                } else {
                    deactivatedCount++;
                }
            }
        }
    }

    console.log(`Cleanup complete! Deactivated ${deactivatedCount} older duplicate bookings.`);
}

runCleanup().catch(console.error);
