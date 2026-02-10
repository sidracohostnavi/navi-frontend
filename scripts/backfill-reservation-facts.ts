/**
 * Backfill Reservation Facts Script (v2 - SAFE)
 * 
 * Re-parses gmail_messages with updated parsing logic.
 * SAFE mode: Only updates fields that IMPROVED, never overwrites with NULL.
 * 
 * Run with: npx tsx scripts/backfill-reservation-facts.ts
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

// ============================================================================
// PARSING LOGIC (matches email-processor.ts v2)
// ============================================================================

function cleanGuestName(rawName: string): string | null {
    if (!rawName) return null;

    let name = rawName.trim();

    // Strip trailing patterns
    name = name
        .replace(/\s+arrives\s+.*$/i, '')
        .replace(/\s+check-?in\s+.*$/i, '')
        .replace(/\s+checking\s+.*$/i, '')
        .replace(/\s+for\s+\d+.*$/i, '')
        .replace(/\s+\d+\s*nights?.*$/i, '')
        .replace(/\s*[-–—]\s*$/, '')
        .trim();

    // Strip leading patterns
    name = name
        .replace(/^(?:new\s+)?(?:confirmed\s+)?booking\s*[-:]\s*/i, '')
        .replace(/^reservation\s*[-:]\s*/i, '')
        .trim();

    // Only reject EXACT forbidden names
    const forbiddenNames = ['guest', 'reserved', 'unknown', 'empty', 'not available', 'blocked', 'n/a', 'airbnb', 'vrbo'];
    if (forbiddenNames.includes(name.toLowerCase())) {
        return null;
    }

    if (name.length < 2) {
        return null;
    }

    if (!/^[A-Za-z][A-Za-z'\-\s]*[A-Za-z]$/.test(name) && name.length > 2) {
        if (/^\d/.test(name) || /\d{4}/.test(name)) {
            return null;
        }
    }

    return name;
}

function parseReservationEmail(bodyRaw: string, subject: string): {
    guest_name: string | null;
    guest_count: number;
    check_in: string;
    check_out: string;
    confirmation_code: string;
} | null {
    try {
        const body = bodyRaw.replace(/\s+/g, ' ').trim();

        let guest_name: string | null = null;
        let check_in = '';
        let check_out = '';
        let guest_count: number = 1;

        // Guest Name Extraction
        const lodgifyMatch = subject.match(/(?:Booking|received):\s+([^(,\-#]+)/i);
        if (lodgifyMatch) {
            guest_name = cleanGuestName(lodgifyMatch[1]);
        }

        if (!guest_name) {
            const airbnbMatch = subject.match(/(?:Reservation|Booking)\s+(?:confirmed|from)\s*[-:]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
            if (airbnbMatch) {
                guest_name = cleanGuestName(airbnbMatch[1]);
            }
        }

        if (!guest_name) {
            const bodyNamePatterns = [
                /Guest(?:\s+name)?:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                /Booked by:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                /Name:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
            ];
            for (const pattern of bodyNamePatterns) {
                const match = body.match(pattern);
                if (match) {
                    guest_name = cleanGuestName(match[1]);
                    if (guest_name) break;
                }
            }
        }

        // Dates
        if (subject.includes('Arrival:')) {
            const arrivalMatch = subject.match(/Arrival:\s+([A-Za-z]+\s+\d+(?:,\s*\d{4}|\s+\d{4})?)/i);
            if (arrivalMatch) {
                const parsedDate = new Date(arrivalMatch[1]);
                if (!isNaN(parsedDate.getTime())) {
                    check_in = parsedDate.toISOString().split('T')[0];
                    const nightsMatch = subject.match(/(\d+)\s+Nights?/i);
                    const nights = nightsMatch ? parseInt(nightsMatch[1]) : 1;
                    const outDate = new Date(parsedDate);
                    outDate.setDate(outDate.getDate() + nights);
                    check_out = outDate.toISOString().split('T')[0];
                }
            }
        }

        if (!check_in) {
            const subjectDateMatch = subject.match(/arrives\s+([A-Za-z]+)\s+(\d{1,2})/i);
            if (subjectDateMatch) {
                const currentYear = new Date().getFullYear();
                const ds = `${subjectDateMatch[1]} ${subjectDateMatch[2]}, ${currentYear}`;
                const d = new Date(ds);
                if (!isNaN(d.getTime())) {
                    check_in = d.toISOString().split('T')[0];
                }
            }
        }

        // Guest Count from body
        const guestCountPatterns = [
            /(?:Total\s+)?Guests?:\s*(\d+)/i,
            /(\d+)\s+Guests?(?:\s|$|,)/i,
            /Party\s+size:\s*(\d+)/i,
            /Number\s+of\s+guests?:\s*(\d+)/i,
            /Adults?:\s*(\d+)/i,
            /Travelers?:\s*(\d+)/i,
            /(\d+)\s+adult/i,
            /Occupancy:\s*(\d+)/i,
        ];

        for (const pattern of guestCountPatterns) {
            const match = body.match(pattern);
            if (match) {
                const count = parseInt(match[1]);
                if (count >= 1 && count <= 20) {
                    guest_count = count;
                    break;
                }
            }
        }

        // Confirmation Code
        let confirmation_code = '';
        const lodgifyCode = subject.match(/#([A-Z0-9]{8,15})/i);
        if (lodgifyCode) {
            confirmation_code = lodgifyCode[1];
        } else {
            const codeMatch = body.match(/(?:Confirmation code|Reservation ID).*?([A-Z0-9]{8,15})/i);
            if (codeMatch) confirmation_code = codeMatch[1];
        }

        if (!check_in) return null;

        return {
            guest_name,
            guest_count,
            check_in,
            check_out,
            confirmation_code
        };

    } catch (err: any) {
        console.error(`Parse error: ${err.message}`);
        return null;
    }
}

// ============================================================================
// Helper: Check if new name is better than old
// ============================================================================
function isBetterName(oldName: string | null, newName: string | null): boolean {
    if (!newName) return false;
    if (!oldName) return true;

    // New name should not contain "arrives"
    const oldHasArrives = oldName.toLowerCase().includes('arrives');
    const newHasArrives = newName.toLowerCase().includes('arrives');

    if (oldHasArrives && !newHasArrives) return true;  // New is cleaner
    if (!oldHasArrives && newHasArrives) return false; // Old was already clean

    // If both clean or both dirty, prefer shorter (less garbage)
    return newName.length < oldName.length && newName.length >= 2;
}

// ============================================================================
// MAIN BACKFILL LOGIC (SAFE - only improve, never degrade)
// ============================================================================

interface Change {
    field: string;
    old: any;
    new: any;
}

async function main() {
    console.log('='.repeat(60));
    console.log('RESERVATION FACTS BACKFILL (SAFE MODE)');
    console.log('Only updates fields that IMPROVED, never overwrites with NULL');
    console.log('='.repeat(60));

    // Fetch all gmail_messages with their raw_metadata
    const { data: messages, error: fetchError } = await supabase
        .from('gmail_messages')
        .select('id, gmail_message_id, connection_id, subject, raw_metadata')
        .order('created_at', { ascending: false });

    if (fetchError) {
        console.error('Error fetching gmail_messages:', fetchError);
        process.exit(1);
    }

    console.log(`Found ${messages?.length || 0} gmail_messages to process\n`);

    // Fetch existing reservation_facts for comparison
    const { data: existingFacts } = await supabase
        .from('reservation_facts')
        .select('*');

    const existingFactsMap = new Map(
        (existingFacts || []).map(f => [f.source_gmail_message_id, f])
    );

    let namesCleaned = 0;
    let namesKept = 0;
    let countsFound = 0;
    let newFacts = 0;
    const examples: { subject: string; changes: Change[] }[] = [];

    for (const msg of messages || []) {
        const rawMeta = msg.raw_metadata as any;
        if (!rawMeta?.full_text && !rawMeta?.full_html) {
            continue;
        }

        const subject = msg.subject || '';
        const textToParse = rawMeta.full_html
            ? rawMeta.full_html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
            : rawMeta.full_text;

        const parsed = parseReservationEmail(textToParse, subject);
        if (!parsed) {
            continue;
        }

        const existing = existingFactsMap.get(msg.gmail_message_id);
        const changes: Change[] = [];

        // Build update object - only include fields that improved
        const updateData: any = {
            source_gmail_message_id: msg.gmail_message_id,
            connection_id: msg.connection_id,
            check_in: parsed.check_in,
            listing_name: 'Short-term Rental',
        };

        // Guest name: only update if new is better
        if (isBetterName(existing?.guest_name, parsed.guest_name)) {
            updateData.guest_name = parsed.guest_name;
            changes.push({ field: 'guest_name', old: existing?.guest_name, new: parsed.guest_name });
            namesCleaned++;
        } else if (existing?.guest_name) {
            updateData.guest_name = existing.guest_name; // Keep existing
            namesKept++;
        } else {
            updateData.guest_name = parsed.guest_name;
        }

        // Guest count: only update if we found a real value > 1, or if existing was NULL
        if (parsed.guest_count > 1 || existing?.guest_count === null) {
            if (existing?.guest_count !== parsed.guest_count) {
                changes.push({ field: 'guest_count', old: existing?.guest_count, new: parsed.guest_count });
                if (parsed.guest_count > 1) countsFound++;
            }
            updateData.guest_count = parsed.guest_count;
        } else {
            updateData.guest_count = existing?.guest_count || 1; // Keep existing or default 1
        }

        // Check out: only update if we found one and existing was NULL
        if (parsed.check_out && (!existing?.check_out || existing.check_out === null)) {
            updateData.check_out = parsed.check_out;
            changes.push({ field: 'check_out', old: existing?.check_out, new: parsed.check_out });
        } else if (existing?.check_out) {
            updateData.check_out = existing.check_out; // Keep existing
        } else {
            updateData.check_out = parsed.check_out || null;
        }

        // Confirmation code: prefer existing, add if missing
        if (existing?.confirmation_code) {
            updateData.confirmation_code = existing.confirmation_code;
        } else if (parsed.confirmation_code) {
            updateData.confirmation_code = parsed.confirmation_code;
            changes.push({ field: 'confirmation_code', old: null, new: parsed.confirmation_code });
        }

        updateData.confidence = updateData.guest_name ? 0.9 : 0.5;

        if (!existing) {
            newFacts++;
        }

        // Record examples
        if (examples.length < 15 && changes.length > 0) {
            examples.push({
                subject: subject.substring(0, 60) + (subject.length > 60 ? '...' : ''),
                changes
            });
        }

        // UPSERT
        const { error: upsertError } = await supabase
            .from('reservation_facts')
            .upsert(updateData, { onConflict: 'connection_id, source_gmail_message_id' });

        if (upsertError) {
            console.error(`Error upserting fact for ${msg.gmail_message_id}:`, upsertError);
        }
    }

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log(`Names cleaned (removed 'arrives' etc): ${namesCleaned}`);
    console.log(`Names kept (already clean): ${namesKept}`);
    console.log(`Guest counts found in body: ${countsFound}`);
    console.log(`New facts created: ${newFacts}`);

    console.log('\n' + '='.repeat(60));
    console.log('CHANGES MADE (up to 15)');
    console.log('='.repeat(60));

    for (const ex of examples) {
        console.log(`\nSubject: ${ex.subject}`);
        for (const c of ex.changes) {
            console.log(`  ${c.field}: "${c.old || 'NULL'}" -> "${c.new}"`);
        }
    }

    // Final stats
    const { data: statsData } = await supabase
        .from('reservation_facts')
        .select('guest_name, guest_count, check_out');

    if (statsData) {
        const total = statsData.length;
        const cleanNames = statsData.filter(f =>
            f.guest_name &&
            !f.guest_name.toLowerCase().includes('arrives')
        ).length;
        const hasGuestCount = statsData.filter(f => f.guest_count !== null && f.guest_count >= 1).length;
        const hasCheckout = statsData.filter(f => f.check_out).length;

        console.log('\n' + '='.repeat(60));
        console.log('FINAL STATS');
        console.log('='.repeat(60));
        console.log(`Total facts: ${total}`);
        console.log(`Clean guest_name: ${cleanNames} (${((cleanNames / total) * 100).toFixed(1)}%)`);
        console.log(`Has guest_count: ${hasGuestCount} (${((hasGuestCount / total) * 100).toFixed(1)}%)`);
        console.log(`Has check_out: ${hasCheckout} (${((hasCheckout / total) * 100).toFixed(1)}%)`);
    }
}

main().catch(console.error);
