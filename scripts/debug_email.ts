
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase keys in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function debugEmail() {
    const testEmail = process.argv[2];
    if (!testEmail) {
        console.error('Usage: npx tsx scripts/debug_email.ts <email>');
        process.exit(1);
    }

    console.log(`Attempting to invite ${testEmail}...`);

    try {
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(testEmail, {
            redirectTo: 'http://localhost:3000/cohost/invite-debug',
            // Note: data here usually contains the user object. 
            // If Supabase SMTP is not set up, it might still return success but send no email (if using default rate-limited service)
        });

        if (error) {
            console.error('❌ Supabase Error:', error);
        } else {
            console.log('✅ Success Data:', data);
            console.log('User ID:', data.user?.id);
            console.log('Confirmation Sent At:', data.user?.confirmation_sent_at);
            console.log('Invited At:', data.user?.invited_at);

            if (!data.user?.confirmation_sent_at && !data.user?.invited_at) {
                console.warn('⚠️ No confirmation/invite timestamp found. Email might not have been sent.');
            }
        }
    } catch (err: any) {
        console.error('❌ Unexpected Exception:', err);
    }
}

debugEmail();
