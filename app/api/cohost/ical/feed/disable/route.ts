import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { feed_id } = await request.json();
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Mark feed as inactive
        const { error: feedError } = await supabase
            .from('ical_feeds')
            .update({ is_active: false })
            .eq('id', feed_id);

        if (feedError) throw feedError;

        // 2. Cascade soft-delete to bookings
        const { error: bookingError } = await supabase
            .from('bookings')
            .update({ is_active: false })
            .eq('source_feed_id', feed_id);

        if (bookingError) throw bookingError;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
