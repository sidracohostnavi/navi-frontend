/**
 * Script to reprocess Gmail messages and route to Review items.
 * Run with: npx tsx scripts/run_reprocess.ts
 */
import { createClient } from '@supabase/supabase-js';
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
    console.log("🚀 Starting Gmail to Review Reprocess...\n");

    // Find workspace from bookings table (most reliable)
    const { data: sampleBooking } = await supabase
        .from('bookings')
        .select('workspace_id')
        .limit(1)
        .single();

    const workspaceId = sampleBooking?.workspace_id;
    if (!workspaceId) {
        console.error("❌ Could not find workspace from bookings");
        return;
    }
    console.log(`Using workspace: ${workspaceId}\n`);

    // 1. Get ALL gmail_messages (regardless of connection)
    const { data: emails, error: emailError } = await supabase
        .from('gmail_messages')
        .select('id, gmail_message_id, subject, snippet, raw_metadata, connection_id');

    if (emailError) {
        console.error(`❌ Error fetching emails:`, emailError);
        return;
    }

    console.log(`Found ${emails?.length || 0} gmail_messages total`);

    if (!emails || emails.length === 0) return;

    // 2. Fetch iCal-backed bookings
    const { data: icalBookings } = await supabase
        .from('bookings')
        .select('id, check_in, check_out, reservation_code, source_feed_id, external_uid')
        .eq('workspace_id', workspaceId)
        .not('source_feed_id', 'is', null);

    console.log(`Found ${icalBookings?.length || 0} iCal-backed bookings`);

    // 3. Fetch existing review items
    const { data: existingReviews } = await supabase
        .from('enrichment_review_items')
        .select('id, extracted_data')
        .eq('workspace_id', workspaceId);

    const existingGmailIds = new Set<string>();
    if (existingReviews) {
        for (const r of existingReviews) {
            const gid = r.extracted_data?.gmail_message_id;
            if (gid) existingGmailIds.add(gid);
        }
    }
    console.log(`Existing review items: ${existingReviews?.length || 0}`);
    console.log(`With gmail_message_id: ${existingGmailIds.size}\n`);

    let parsed = 0;
    let created = 0;
    let skipped = 0;
    let hasIcal = 0;

    for (const email of emails) {
        // Parse subject for reservation
        const subject = email.subject || '';
        if (!/Reservation confirmed|Booking confirmed/i.test(subject)) {
            continue; // Not a reservation
        }

        // Extract guest name from subject
        const nameMatch = subject.match(/[–-]\s*([^–-]+?)\s+arrives/i);
        const guestName = nameMatch ? nameMatch[1].trim() : 'Unknown';

        // Extract date from subject
        const dateMatch = subject.match(/arrives\s+([A-Za-z]+)\s+(\d{1,2})/i);
        let checkIn = '';
        if (dateMatch) {
            const year = new Date().getFullYear();
            const d = new Date(`${dateMatch[1]} ${dateMatch[2]}, ${year}`);
            if (!isNaN(d.getTime())) {
                checkIn = d.toISOString().split('T')[0];
            }
        }

        // Try to get confirmation code
        let confirmationCode = '';
        const raw = email.raw_metadata || {};
        const bodyText = raw.full_text || raw.full_html || email.snippet || '';
        const codeMatch = bodyText.match(/Confirmation code\s*[:\s]*([A-Z0-9]{8,15})/i);
        if (codeMatch) {
            confirmationCode = codeMatch[1];
        }
        // Fallback: look for HM... pattern
        if (!confirmationCode) {
            const hmMatch = bodyText.match(/\b(HM[A-Z0-9]{8,12})\b/);
            if (hmMatch) confirmationCode = hmMatch[1];
        }

        parsed++;
        console.log(`📧 ${guestName} | ${checkIn} | code=${confirmationCode || 'N/A'}`);

        // Check for iCal match
        let hasMatch = false;
        if (icalBookings && confirmationCode) {
            hasMatch = icalBookings.some(b =>
                b.reservation_code === confirmationCode ||
                (b.external_uid && b.external_uid.includes(confirmationCode))
            );
        }
        if (!hasMatch && icalBookings && checkIn) {
            hasMatch = icalBookings.some(b => {
                const bIn = new Date(b.check_in).toISOString().split('T')[0];
                return bIn === checkIn;
            });
        }

        if (hasMatch) {
            console.log(`   ✅ Has iCal backing - skipping`);
            hasIcal++;
            continue;
        }

        // Check idempotency
        if (existingGmailIds.has(email.gmail_message_id)) {
            console.log(`   ⏭️ Already in review - skipping`);
            skipped++;
            continue;
        }

        // Insert review item - CORRECT SCHEMA: id, workspace_id, connection_id, extracted_data, status
        const { error: insertError } = await supabase
            .from('enrichment_review_items')
            .insert({
                workspace_id: workspaceId,
                connection_id: email.connection_id,
                extracted_data: {
                    gmail_message_id: email.gmail_message_id,
                    guest_name: guestName,
                    check_in: checkIn,
                    confirmation_code: confirmationCode
                },
                status: 'pending'
            });

        if (insertError) {
            console.error(`   ❌ Insert failed:`, insertError.message);
        } else {
            console.log(`   ✅ Created review item!`);
            created++;
            existingGmailIds.add(email.gmail_message_id);
        }
    }

    console.log(`\n========================================`);
    console.log(`SUMMARY:`);
    console.log(`Reservations parsed: ${parsed}`);
    console.log(`Has iCal backing: ${hasIcal}`);
    console.log(`Already in review: ${skipped}`);
    console.log(`Review items created: ${created}`);

    // Final count
    const { count } = await supabase
        .from('enrichment_review_items')
        .select('*', { count: 'exact', head: true });

    console.log(`\nTotal enrichment_review_items: ${count}`);

    // Show Longhao specifically
    const { data: longhao } = await supabase
        .from('enrichment_review_items')
        .select('*')
        .ilike('extracted_data->>guest_name', '%longhao%');

    if (longhao && longhao.length > 0) {
        console.log(`\n✅ Longhao review item:`, JSON.stringify(longhao[0], null, 2));
    }
}

reprocess().then(() => {
    console.log("\n✅ Done");
    process.exit(0);
}).catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
