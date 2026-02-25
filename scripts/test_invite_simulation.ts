
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Setup clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
    console.log('--- Simulating Invite Flow ---');

    // 1. Mock Data (Sidra's Workspace)
    const invitee_email = 'sidra+simulation@example.com';
    const workspaceId = 'd89342dc-6523-42eb-9031-75ac6814c6e9'; // NEED A VALID ID. Will query one.
    const inviterId = 'b3b5f487-8866-44b0-956b-bdc23352006d'; // Sidra's ID from previous logs

    console.log(`Target: ${invitee_email}`);

    // Get a valid workspace if ID is wrong
    const { data: ws } = await supabase.from('cohost_workspaces').select('id, slug').limit(1).single();
    if (!ws) throw new Error('No workspace found to test with');
    console.log(`Using Workspace: ${ws.slug} (${ws.id})`);

    // 2. Generate Token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenLast4 = token.slice(-4);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`Generated Token: ...${tokenLast4}`);

    // 3. Insert Invite (The Logic in Route)
    const { data: invite, error: inviteError } = await supabase
        .from('cohost_workspace_invites')
        .insert({
            workspace_id: ws.id,
            invitee_email: invitee_email,
            invitee_name: 'Simulation User',
            role_label: 'simulate',
            can_view_calendar: true,
            can_view_guest_name: true,
            can_view_guest_count: true,
            can_view_booking_notes: false,
            can_view_contact_info: false,
            token_hash: tokenHash,
            token_last4: tokenLast4,
            invited_by: inviterId, // Must be valid UUID
            expires_at: expiresAt,
        })
        .select()
        .single();

    if (inviteError) {
        console.error('❌ DB Insert Failed:', inviteError);
        return;
    }
    console.log('✅ DB Insert Success:', invite.id);

    // 4. Send Email (The Logic in Route)
    const inviteUrl = `http://localhost:3000/cohost/invite?token=${token}`;
    console.log(`Invite URL: ${inviteUrl}`);

    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(invitee_email, {
        redirectTo: inviteUrl,
    });

    if (authError) {
        console.error('⚠️ Supabase Email Failed (Expected if blocked):', authError);
    } else {
        console.log('✅ Supabase Email Sent:', authData);
    }

    console.log('--- Simulation Complete ---');
}

run().catch(console.error);
