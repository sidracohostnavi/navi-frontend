import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase
        .from('gmail_messages')
        .select('subject, raw_metadata')
        .ilike('subject', '%Payment received%Shivam%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        console.error("Failed to find email:", error);
        return;
    }

    // Print exact plain text we feed into parser
    const bodyText = data.raw_metadata.full_text;
    const bodyHtml = data.raw_metadata.full_html;

    const textToParse = bodyHtml ?
        bodyHtml.replace(/<style[^>]*>[\\s\\S]*?<\\/style > /gi, '').replace(/ < [^>] +> /g, '\\n').replace(/ & nbsp;/g, ' ')
    : bodyText;

    console.log('=== SUBJECT ===');
    console.log(data.subject);
    console.log('\\n=== EXTRACTED TEXT (What the parser sees) ===');
    console.log(textToParse);
}

run();
