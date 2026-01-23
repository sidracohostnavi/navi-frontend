import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { property_id } = await request.json();
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // NUCLEAR OPTION: Soft-delete ALL imported bookings (legacy and new)
        // We identify imported bookings as anything that isn't 'direct' (manual)
        // This catches:
        // 1. New bookings with source_feed_id
        // 2. Old/Legacy bookings where source_feed_id is NULL but source_type is 'airbnb', 'vrbo', 'other', etc.
        const { error, count } = await supabase
            .from('bookings')
            .update({ is_active: false })
            .eq('property_id', property_id)
            .neq('source_type', 'direct');

        if (error) throw error;

        return NextResponse.json({ success: true, count });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
