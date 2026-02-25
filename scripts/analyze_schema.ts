
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceKey);

async function analyzeSchema() {
    console.log('--- Analyzing Schema for workspace_id references ---');

    // Find all columns named 'workspace_id' in public tables
    const { data: workspaceColumns, error: colError } = await admin
        .from('information_schema.columns')
        .select('table_name, column_name')
        .eq('table_schema', 'public')
        .eq('column_name', 'workspace_id')
        .order('table_name');

    if (colError) {
        console.error('Error fetching columns:', colError);
        return;
    }

    console.log('Tables with workspace_id column:');
    workspaceColumns?.forEach(c => console.log(`- ${c.table_name}`));

    // Find Foreign Keys referencing cohost_workspaces
    // Note: This query is a bit complex for PostgREST on information_schema, 
    // so we'll rely on the column name scan as a primary heuristic 
    // and manually check constraint names if needed.

    // Also check for 'cohost_workspaces' soft delete column
    const { data: workspaceTable, error: tableError } = await admin
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'cohost_workspaces');

    if (tableError) console.error('Error checking cohost_workspaces columns:', tableError);

    const hasArchivedAt = workspaceTable?.some(c => c.column_name === 'archived_at');
    const hasIsActive = workspaceTable?.some(c => c.column_name === 'is_active');
    const hasDeletedAt = workspaceTable?.some(c => c.column_name === 'deleted_at');

    console.log('\n--- Workspace Soft Delete Capabilities ---');
    console.log(`- Has 'archived_at': ${hasArchivedAt}`);
    console.log(`- Has 'is_active': ${hasIsActive}`);
    console.log(`- Has 'deleted_at': ${hasDeletedAt}`);

}

analyzeSchema();
