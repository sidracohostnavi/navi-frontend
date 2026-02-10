
import { createClient } from '@supabase/supabase-js';
import { EmailProcessor } from '../lib/services/email-processor';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase URL or Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function reprocess() {
    console.log("🚀 Starting BATCH Reprocessing Script...");

    // 1. Fetch ALL reservation_facts (or recently updated ones?)
    // User requested "all 14 reservation_facts".
    // We'll fetch all facts to be safe, maybe limit to recent 50 to avoid huge batches if this grows.
    const { data: facts, error: factError } = await supabase
        .from('reservation_facts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

    if (factError || !facts || facts.length === 0) {
        console.error("❌ No reservation facts found or error:", factError);
        return;
    }

    console.log(`Found ${facts.length} reservation facts candidates.`);

    let emails_found = 0;
    let parsed_ok = 0;
    let updated_rows = 0;
    let total_candidates = facts.length;
    const errors: string[] = [];

    // 2. Iterate and Fix
    for (const fact of facts) {
        console.log(`\n-----------------------------------------------------------`);
        console.log(`🔄 Processing Fact: ${fact.id} (Current: ${fact.guest_name})`);
        console.log(`   Source Gmail ID: ${fact.source_gmail_message_id}`);

        if (!fact.source_gmail_message_id) {
            console.warn(`   ⚠️  Fact missing source_gmail_message_id. Skipping.`);
            continue;
        }

        // CORRECT LOOKUP: match gmail_messages.gmail_message_id = fact.source_gmail_message_id
        // NOT gmail_messages.id (UUID)
        const { data: emailRows, error: emailError } = await supabase
            .from('gmail_messages')
            .select('*')
            .eq('gmail_message_id', fact.source_gmail_message_id); // Look for TEXT match

        if (emailError) {
            console.error(`   ❌ Email Lookup Error: ${emailError.message}`);
            continue;
        }

        const email = emailRows && emailRows.length > 0 ? emailRows[0] : null;

        if (!email) {
            console.error(`   ❌ EMAIL_LOOKUP_MISS: Could not find email row for ${fact.source_gmail_message_id}`);

            // Log to enrichment_logs as requested
            await supabase.from('enrichment_logs').insert({
                connection_id: fact.connection_id,
                status: 'error',
                details: `EMAIL_LOOKUP_MISS: Fact ${fact.id} -> Msg ${fact.source_gmail_message_id}`
            });
            errors.push(`Missing Email: ${fact.source_gmail_message_id}`);
            continue;
        }

        emails_found++;
        console.log(`   ✅ Found Email: ${email.id} | Subject: ${email.subject}`);

        // Prepare Body
        const raw = email.raw_metadata || {};
        let bodyToParse = '';
        if (raw.full_html) {
            bodyToParse = raw.full_html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
        } else if (raw.full_text) {
            bodyToParse = raw.full_text;
        } else if (raw.body) {
            bodyToParse = raw.body;
        } else {
            bodyToParse = email.snippet;
        }

        // Parse
        const newFact = EmailProcessor.parseReservationEmail(bodyToParse, email.subject);

        if (!newFact) {
            console.warn(`   ⚠️  Parsing failed for email ${email.id}.`);
            continue;
        }

        newFact.guest_count = Math.floor(newFact.guest_count ?? 1) || 1;
        parsed_ok++;

        // Update Fact
        const { data: updatedFact, error: updateError } = await supabase
            .from('reservation_facts')
            .update({
                check_in: newFact.check_in,
                check_out: newFact.check_out,
                guest_name: newFact.guest_name,
                guest_count: newFact.guest_count,
                confirmation_code: newFact.confirmation_code,
                listing_name: newFact.listing_name,
                confidence: newFact.confidence,
                raw_data: newFact.raw
            })
            .eq('id', fact.id)
            .select()
            .single();

        if (updateError) {
            console.error(`   ❌ Update Fact Error: ${updateError.message}`);
            continue;
        }
        console.log(`   ✅ Corrected Fact: "${updatedFact.guest_name}" (${updatedFact.guest_count} guests)`);


        // MATCH & ENRICH BOOKING
        const { data: connProps } = await supabase
            .from('connection_properties')
            .select('property_id')
            .eq('connection_id', fact.connection_id);

        const propertyIds = connProps ? connProps.map(cp => cp.property_id) : [];
        if (propertyIds.length === 0) {
            console.warn(`   ⚠️  No linked properties. Skipping enrichment.`);
            continue;
        }

        // Fetch ALL candidates in date range across ALL properties
        const checkInDate = new Date(newFact.check_in);
        const minDate = new Date(checkInDate); minDate.setDate(minDate.getDate() - 5);
        const maxDate = new Date(checkInDate); maxDate.setDate(maxDate.getDate() + 5);

        const { data: candidates } = await supabase
            .from('bookings')
            .select('*')
            .in('property_id', propertyIds)
            .gte('check_in', minDate.toISOString())
            .lte('check_in', maxDate.toISOString());

        if (!candidates || candidates.length === 0) {
            console.warn(`   ⚠️  No active bookings found in date range.`);
            continue;
        }

        let targetBooking = null;
        let matchReason = '';

        // 1. Strong Match: Confirmation Code
        if (newFact.confirmation_code) {
            const codeMatch = candidates.find(b =>
                b.reservation_code === newFact.confirmation_code ||
                (b.raw_data && JSON.stringify(b.raw_data).includes(newFact.confirmation_code))
            );
            if (codeMatch) {
                targetBooking = codeMatch;
                matchReason = 'Confirmation Code';
            }
        }

        // 2. Fallback: Date Match (with Guardrails)
        if (!targetBooking) {
            const targetDay = newFact.check_in;
            const dateMatches = candidates.filter(b => new Date(b.check_in).toISOString().split('T')[0] === targetDay);

            if (dateMatches.length === 1) {
                targetBooking = dateMatches[0];
                matchReason = 'Unique Date';
            } else if (dateMatches.length > 1) {
                // AMBIGUITY CHECK
                const distinctProps = new Set(dateMatches.map(b => b.property_id));
                if (distinctProps.size > 1) {
                    console.error(`   ❌ PROPERTY_RESOLUTION_BLOCKED_EMAIL: Ambiguous date match across ${distinctProps.size} properties.`);
                    await supabase.from('enrichment_logs').insert({
                        connection_id: fact.connection_id,
                        status: 'error',
                        details: `PROPERTY_RESOLUTION_BLOCKED_EMAIL: Date ${targetDay} matches properties ${Array.from(distinctProps).join(', ')}`
                    });
                    errors.push(`Ambiguous Date: ${newFact.check_in}`);
                    continue; // SKIP
                } else {
                    // Multiple bookings on SAME property (e.g. cleaning blocks?) - might be risky but likely same unit.
                    // Pick first? Or skip?
                    // Prompt says "multiple properties". Same property is technically resolved property.
                    matchReason = 'Date (Single Property)';
                    targetBooking = dateMatches[0];
                }
            }
        }

        if (targetBooking) {
            console.log(`   ✅ Matched via ${matchReason}`);

            // CRITICAL SAFETY RULE:
            // - Email enrichment ONLY updates guest metadata (name, count)
            // - NEVER modifies property_id (comes from iCal feed only)
            // - NEVER creates new bookings (UPDATE only, no INSERT/UPSERT)
            // - Property assignment is determined exclusively by iCal sync

            // Proceed to update...

            const guestName = newFact.guest_name || 'Guest';
            const firstName = guestName.split(' ')[0];
            const lastInitial = guestName.split(' ').length > 1 ? guestName.split(' ').pop()?.replace('.', '') : '';
            const displayName = `${firstName} ${lastInitial ? lastInitial + '.' : ''}`;

            await supabase
                .from('bookings')
                .update({
                    guest_name: displayName,
                    guest_count: newFact.guest_count,
                    guest_first_name: firstName,
                    guest_last_initial: lastInitial,
                    raw_data: { ...targetBooking.raw_data, enriched_manually: true, from_fact_id: updatedFact.id }
                })
                .eq('id', targetBooking.id);

            updated_rows++;
            console.log(`   ✅ Enriched Booking ${targetBooking.id} -> ${displayName}`);
        } else {
            console.warn(`   ⚠️  No matching booking found for ${newFact.check_in}`);
        }
    }

    // FINAL SUMMARY
    console.log(`\n===========================================================`);
    console.log(`BATCH SUMMARY:`);
    console.log(`Total Candidates : ${total_candidates}`);
    console.log(`Emails Found     : ${emails_found}`);
    console.log(`Parsed OK        : ${parsed_ok}`);
    console.log(`Bookings Enriched: ${updated_rows}`);
    console.log(`Errors           : ${errors.length}`);
    console.log(`===========================================================`);

    if (emails_found < total_candidates) {
        console.error(`❌ FAILED: Found only ${emails_found}/${total_candidates} emails.`);
        process.exit(1);
    }

    if (updated_rows === 0 && parsed_ok > 0) {
        console.warn(`⚠️  Parsed emails but updated 0 bookings. Check sync status.`);
    }

}

reprocess();
