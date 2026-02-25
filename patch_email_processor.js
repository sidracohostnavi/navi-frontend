const fs = require('fs');
const file = "/Users/sidra/Documents/GitHub/navi-frontend/lib/services/email-processor.ts";
let content = fs.readFileSync(file, 'utf8');

// 1. Fixing processStoredMessages
content = content.replace(
`                } else if (raw.full_text) {
                    bodyToParse = raw.full_text;
                } else {
                    bodyToParse = email.snippet || '';`,
`                } else if (raw.full_text) {
                    bodyToParse = raw.full_text;
                } else if (raw.original_msg?.bodyText) {
                    bodyToParse = raw.original_msg.bodyText;
                } else {
                    bodyToParse = email.snippet || '';`
);


// 2. Fixing parseReservationEmail (Lodgify Arrival fallback)
const fallbackBlock = `
            // G. Body: "Arrival:" (Lodgify template fallback)
            if (!check_in) {
                const lodgifyArrival = body.match(/Arrival:\\s+([A-Za-z]{3,9}\\s+\\d{1,2}(?:[,\\s]+\\d{4})?)/i);
                if (lodgifyArrival) {
                    check_in = parseDate(lodgifyArrival[1]) || '';
                }
            }

            // NOTE: If check_out is still empty here`;
content = content.replace(`
            // NOTE: If check_out is still empty here`, fallbackBlock);


// 3. Fix silent drop in processNewMessages
// Change insert processed_at logic
content = content.replace(
`                    raw_metadata: {
                        full_text: msg.bodyText,
                        full_html: msg.bodyHtml,
                        original_msg: msg,
                        classification
                    },
                    processed_at: new Date().toISOString()
                });`,
`                    raw_metadata: {
                        full_text: msg.bodyText,
                        full_html: msg.bodyHtml,
                        original_msg: msg,
                        classification
                    },
                    processed_at: classification.message_type === 'reservation_confirmation' ? null : new Date().toISOString()
                });`
);

// Handling !fact (line 319-322 originally)
content = content.replace(
`            if (!fact) {
                // breakdown handled inside parseReservationEmail
                console.warn(\`[EmailProcessor] Failed to parse confirmed candidate: \${msg.subject}\`);
                continue;
            }`,
`            if (!fact) {
                // breakdown handled inside parseReservationEmail
                console.warn(\`[EmailProcessor] Failed to parse confirmed candidate: \${msg.subject}\`);
                await supabase.from('gmail_messages').update({
                    raw_metadata: {
                        full_text: msg.bodyText,
                        full_html: msg.bodyHtml,
                        original_msg: msg,
                        classification,
                        parse_error: 'parseReservationEmail returned null'
                    }
                }).eq('gmail_message_id', msg.gmail_message_id);
                continue;
            }`
);

// Handling validation error (line 328-334 originally)
content = content.replace(
`            const validationError = this.validateReservationFact(fact);
            if (validationError) {
                stats.rejected_invalid++;
                console.warn(\`[EmailProcessor] Validation failed for \${msg.gmail_message_id}: \${validationError}\`);

                if (validationError.includes('guest name')) stats.validation_fail_name++;
                else if (validationError.includes('dates')) stats.validation_fail_date++;
                else if (validationError.includes('confirmation code')) stats.validation_fail_code++;

                continue;
            }`,
`            const validationError = this.validateReservationFact(fact);
            if (validationError) {
                stats.rejected_invalid++;
                console.warn(\`[EmailProcessor] Validation failed for \${msg.gmail_message_id}: \${validationError}\`);

                await supabase.from('gmail_messages').update({
                    raw_metadata: {
                        full_text: msg.bodyText,
                        full_html: msg.bodyHtml,
                        original_msg: msg,
                        classification,
                        parse_error: validationError
                    }
                }).eq('gmail_message_id', msg.gmail_message_id);

                if (validationError.includes('guest name')) stats.validation_fail_name++;
                else if (validationError.includes('dates')) stats.validation_fail_date++;
                else if (validationError.includes('confirmation code')) stats.validation_fail_code++;

                continue;
            }`
);

// Handling duplicate guard and processed_at success update
const guardAndUpsert = `            const sourceGmailId = msg.gmail_message_id; // Canonical ID
            if (!sourceGmailId) {
                console.error(\`[EmailProcessor] CRITICAL: Missing gmail_message_id for \${msg.subject}\`);
                continue;
            }

            const { data: existingFact } = await supabase
                .from('reservation_facts')
                .select('id')
                .eq('source_gmail_message_id', sourceGmailId)
                .single();

            if (existingFact) {
                console.log(\`[EmailProcessor] Fact already exists for \${sourceGmailId}, skipping insert.\`);
                await supabase.from('gmail_messages').update({ processed_at: new Date().toISOString() }).eq('gmail_message_id', sourceGmailId);
                continue;
            }

            const { error: factError } = await supabase
                .from('reservation_facts')
                .upsert({
                    source_gmail_message_id: sourceGmailId,
                    connection_id: connectionId,
                    check_in: fact.check_in,
                    check_out: fact.check_out,
                    guest_name: fact.guest_name,
                    guest_count: fact.guest_count,
                    confirmation_code: fact.confirmation_code,
                    listing_name: fact.listing_name,
                    confidence: fact.confidence,
                    raw_data: fact.raw
                }, { onConflict: 'connection_id, source_gmail_message_id' });

            if (factError) {
                console.error(\`[EmailProcessor] Error storing fact:\`, factError);
            } else {
                stats.facts_created++;
                await supabase.from('gmail_messages').update({ processed_at: new Date().toISOString() }).eq('gmail_message_id', sourceGmailId);
                // console.log(\`[EmailProcessor] ✅ Fact Upserted: \${fact.guest_name} (\${fact.check_in})\`);
            }`;

const searchUpsertBlock = `            const sourceGmailId = msg.gmail_message_id; // Canonical ID
            if (!sourceGmailId) {
                console.error(\`[EmailProcessor] CRITICAL: Missing gmail_message_id for \${msg.subject}\`);
                continue;
            }

            const { error: factError } = await supabase
                .from('reservation_facts')
                .upsert({
                    source_gmail_message_id: sourceGmailId,
                    connection_id: connectionId,
                    check_in: fact.check_in,
                    check_out: fact.check_out,
                    guest_name: fact.guest_name,
                    guest_count: fact.guest_count,
                    confirmation_code: fact.confirmation_code,
                    listing_name: fact.listing_name,
                    confidence: fact.confidence,
                    raw_data: fact.raw
                }, { onConflict: 'connection_id, source_gmail_message_id' });

            if (factError) {
                console.error(\`[EmailProcessor] Error storing fact:\`, factError);
            } else {
                stats.facts_created++;
                // console.log(\`[EmailProcessor] ✅ Fact Upserted: \${fact.guest_name} (\${fact.check_in})\`);
            }`;

content = content.replace(searchUpsertBlock, guardAndUpsert);

fs.writeFileSync(file, content);
console.log("Patched!");
