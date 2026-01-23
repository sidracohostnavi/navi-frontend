import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
// Force Rebuild
import { EmailProcessor } from '@/lib/services/email-processor';

// Simple MOCK Gmail fetcher for demo purposes
// In production, this would use the Gmail API with the connection's tokens
async function processGmailConnection(connectionId: string, label: string) {
    // 1. Retrieve connection tokens (not implemented here, assuming validity)
    // 2. Fetch from Gmail API
    // 3. Return mapped messages

    // MOCK DATA for testing the parser
    return [
        {
            id: `msg_mock_${Date.now()}_1`,
            subject: 'Reservation confirmed - John Doe - Seaside Villa',
            snippet: 'Your reservation is confirmed. Arrive: Mon, Dec 25, 2026. Depart: Fri, Dec 29, 2026. Confirmation code: HM12345678. 2 guests.',
            body: 'Full email body would go here... Arrive: Mon, Dec 25, 2026. Depart: Fri, Dec 29, 2026. Confirmation code: HM12345678. Guest: John Doe.',
            mock_check_in: '2026-12-25',
            mock_check_out: '2026-12-29'
        },
        {
            id: `msg_mock_${Date.now()}_2`,
            subject: 'Reservation confirmed - Jane Smith - Mountain Cabin',
            snippet: 'Pack your bags! Confirmation code: XY98765432. 1 guest. Arrive: Jan 1, 2025. Depart: Jan 5, 2025.',
            body: '...', // Historical date test
            mock_check_in: '2025-01-01',
            mock_check_out: '2025-01-05'
        }
    ];
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();

    try {
        const body = await req.json();
        const { connection_id } = body;

        if (!connection_id) {
            return NextResponse.json({ error: 'Missing connection_id' }, { status: 400 });
        }

        // 1. Get Connection Config (Label)
        // Adjust query to match actual schema (assuming 'label_config' or similar column exists per task description)
        // For now, defaulting to 'reservation_label' from prior tasks
        const { data: connection } = await supabase
            .from('connections')
            .select('*')
            .eq('id', connection_id)
            .single();

        if (!connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const label = connection.reservation_label || 'Airbnb';

        // 2. Fetch Messages (Mock)
        // 2. Process (Auto-fetch real messages inside processor if not provided)
        const facts = await EmailProcessor.processMessages(connection_id);

        return NextResponse.json({
            success: true,
            facts_extracted: facts.length,
            facts
        });

    } catch (err: any) {
        console.error('API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
