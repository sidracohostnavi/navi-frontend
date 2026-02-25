require('dotenv').config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    const msgId = "8d6c3dd9-cdd4-4113-acac-d01b13030133";
    const { data: m } = await supabase.from('gmail_messages').select('raw_metadata').eq('id', msgId).single();

    const raw = m.raw_metadata;
    let bodyToParse = '';
    if (raw.full_html) {
        bodyToParse = raw.full_html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, '\n')
            .replace(/&nbsp;/g, ' ');
    } else if (raw.full_text) {
        bodyToParse = raw.full_text;
    } else if (raw.original_msg?.bodyText) {
        bodyToParse = raw.original_msg.bodyText;
    }

    console.log("----- BODY -----");
    console.log(bodyToParse.substring(0, 1500)); // Print top 1500 chars

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
        const match = bodyToParse.match(pattern);
        if (match) {
            console.log("\nMATCHED PATTERN:", pattern);
            console.log("CAPTURED COUNT:", match[1]);
            console.log("FULL MATCH STRING:", match[0]);
        }
    }
}

run();
