/**
 * Cleanup script: Remove review items that have matching bookings.
 * Run with: npx tsx scripts/cleanup_duplicates.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
    console.log("🧹 Cleaning up duplicate review items...\n");

    // 1. Get all pending review items
    const { data: reviewItems, error: riError } = await supabase
        .from('enrichment_review_items')
        .select('id, extracted_data, workspace_id')
        .eq('status', 'pending');

    if (riError || !reviewItems) {
        console.error("Failed to fetch review items:", riError);
        return;
    }

    console.log(`Found ${reviewItems.length} pending review items`);

    // 2. Get all active bookings
    const { data: bookings, error: bkError } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, source_feed_id, is_active')
        .eq('is_active', true);

    if (bkError || !bookings) {
        console.error("Failed to fetch bookings:", bkError);
        return;
    }

    console.log(`Found ${bookings.length} active bookings\n`);

    // Helper to normalize name for matching (e.g., "Liz Servin" -> "Liz S.")
    const normalizeForMatch = (name: string) => {
        if (!name) return '';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].toLowerCase();
        const first = parts[0].toLowerCase();
        const lastInitial = parts[parts.length - 1][0]?.toLowerCase() || '';
        return `${first} ${lastInitial}`;
    };

    let deleted = 0;
    let kept = 0;

    for (const ri of reviewItems) {
        const ext = ri.extracted_data || {};
        const guestName = ext.guest_name || '';
        const checkIn = ext.check_in || '';

        // Try to match against bookings
        let hasMatch = false;

        for (const bk of bookings) {
            // Match by date
            const bkCheckIn = new Date(bk.check_in).toISOString().split('T')[0];
            if (bkCheckIn !== checkIn) continue;

            // Match by name (fuzzy)
            const riNorm = normalizeForMatch(guestName);
            const bkNorm = normalizeForMatch(bk.guest_name);

            // Check if names are similar
            if (riNorm === bkNorm ||
                bk.guest_name?.toLowerCase().includes(guestName.split(' ')[0]?.toLowerCase()) ||
                guestName.toLowerCase().includes(bk.guest_name?.split(' ')[0]?.toLowerCase())) {
                hasMatch = true;
                console.log(`✓ MATCH: "${guestName}" (${checkIn}) <-> "${bk.guest_name}" (${bkCheckIn})`);
                break;
            }
        }

        if (hasMatch) {
            // Delete the duplicate review item
            const { error: delError } = await supabase
                .from('enrichment_review_items')
                .delete()
                .eq('id', ri.id);

            if (delError) {
                console.error(`  Failed to delete ${ri.id}:`, delError.message);
            } else {
                deleted++;
            }
        } else {
            kept++;
            console.log(`✗ NO MATCH: "${guestName}" (${checkIn}) - keeping in review`);
        }
    }

    console.log(`\n========================================`);
    console.log(`Deleted: ${deleted} (had matching booking)`);
    console.log(`Kept: ${kept} (no matching booking)`);

    // Final count
    const { count } = await supabase
        .from('enrichment_review_items')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    console.log(`\nRemaining pending review items: ${count}`);
}

cleanup().then(() => {
    console.log("\n✅ Done");
    process.exit(0);
}).catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
