import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ICalProcessor } from './lib/services/ical-processor';
import { createClient } from './lib/supabase/server';

async function main() {
    const propertyId = '99c9875e-07c1-4e5d-bc01-3a5b9c1b0937';
    console.log("Triggering sync for property:", propertyId);

    // Create a client
    const supabase = await createClient();

    const { data: property } = await supabase
        .from('cohost_properties')
        .select('id, workspace_id')
        .eq('id', propertyId)
        .single();

    const { data: feeds } = await supabase
        .from('ical_feeds')
        .select('*')
        .eq('property_id', propertyId)
        .eq('is_active', true);

    for (const feed of feeds || []) {
        console.log(`Syncing feed: ${feed.id} ${feed.source_name}`);
        const result = await ICalProcessor.syncFeed(feed, property.workspace_id);
        console.log("Result:", result);
    }
}
main();
