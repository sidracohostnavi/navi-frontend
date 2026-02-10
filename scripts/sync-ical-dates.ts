/**
 * Sync iCal Dates to Reservation Facts
 * 
 * Triggers enrichment for all connections to sync authoritative iCal dates
 * from bookings to reservation_facts.
 * 
 * Run with: npx tsx scripts/sync-ical-dates.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log('='.repeat(60));
    console.log('SYNC iCAL DATES TO RESERVATION FACTS');
    console.log('='.repeat(60));

    // Get all connections
    const { data: connections, error } = await supabase
        .from('connections')
        .select('id, name');

    if (error) {
        console.error('Error fetching connections:', error);
        process.exit(1);
    }

    console.log(`Found ${connections?.length || 0} connections with Gmail sync\n`);

    // Get all reservation_facts
    const { data: factsBefore } = await supabase
        .from('reservation_facts')
        .select('id, check_in, check_out, guest_name');

    const factsWithCheckout = factsBefore?.filter(f => f.check_out)?.length || 0;
    console.log(`Before: ${factsBefore?.length || 0} facts, ${factsWithCheckout} with check_out dates\n`);

    // Match facts to bookings and sync dates
    let datesSynced = 0;

    const { data: facts } = await supabase
        .from('reservation_facts')
        .select('*');

    if (!facts || facts.length === 0) {
        console.log('No facts to process');
        return;
    }

    // Get all bookings
    const { data: bookings } = await supabase
        .from('bookings')
        .select('*');

    if (!bookings || bookings.length === 0) {
        console.log('No bookings to match against');
        return;
    }

    console.log(`Processing ${facts.length} facts against ${bookings.length} bookings...\n`);

    for (const fact of facts) {
        if (!fact.check_in) continue;

        let matchedBooking = null;

        // Try confirmation code match
        if (fact.confirmation_code) {
            matchedBooking = bookings.find(b =>
                b.reservation_code === fact.confirmation_code ||
                (b.raw_data && JSON.stringify(b.raw_data).includes(fact.confirmation_code))
            );
        }

        // Try exact date match
        if (!matchedBooking && fact.check_in && fact.check_out) {
            const matches = bookings.filter(b => {
                const bIn = new Date(b.check_in).toISOString().split('T')[0];
                const bOut = new Date(b.check_out).toISOString().split('T')[0];
                return bIn === fact.check_in && bOut === fact.check_out;
            });
            if (matches.length === 1) {
                matchedBooking = matches[0];
            }
        }

        // Try check_in only match (for facts missing checkout)
        if (!matchedBooking && fact.check_in && !fact.check_out) {
            const matches = bookings.filter(b => {
                const bIn = new Date(b.check_in).toISOString().split('T')[0];
                return bIn === fact.check_in;
            });
            if (matches.length === 1) {
                matchedBooking = matches[0];
            }
        }

        if (matchedBooking) {
            const bookingCheckIn = new Date(matchedBooking.check_in).toISOString().split('T')[0];
            const bookingCheckOut = new Date(matchedBooking.check_out).toISOString().split('T')[0];

            // Only update if different
            if (fact.check_in !== bookingCheckIn || fact.check_out !== bookingCheckOut) {
                const { error: updateError } = await supabase
                    .from('reservation_facts')
                    .update({
                        check_in: bookingCheckIn,
                        check_out: bookingCheckOut
                    })
                    .eq('id', fact.id);

                if (!updateError) {
                    datesSynced++;
                    console.log(`✅ ${fact.guest_name}: ${fact.check_in}/${fact.check_out || 'NULL'} -> ${bookingCheckIn}/${bookingCheckOut}`);
                }
            }
        }
    }

    // Final stats
    const { data: factsAfter } = await supabase
        .from('reservation_facts')
        .select('id, check_in, check_out');

    const factsWithCheckoutAfter = factsAfter?.filter(f => f.check_out)?.length || 0;

    console.log('\n' + '='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log(`Dates synced: ${datesSynced}`);
    console.log(`Facts with check_out: ${factsWithCheckout} -> ${factsWithCheckoutAfter}`);
}

main().catch(console.error);
