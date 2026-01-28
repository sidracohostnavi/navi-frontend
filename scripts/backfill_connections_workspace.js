require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runBackfill() {
    console.log('=== Phase 2: Connections Workspace Backfill ===\n');

    // --- STAGE A: ANALYSIS ---
    console.log('--- Stage A: Analysis ---');

    // 1. Fetch all connections
    const { data: connections, error: cxError } = await supabase
        .from('connections')
        .select('id, name, display_email, workspace_id');

    if (cxError) {
        console.error('Error fetching connections:', cxError);
        return;
    }

    // 2. Fetch all mappings to properties with workspace info
    // We need: connection_id -> workspace_id (via property)
    const { data: mappings, error: mapError } = await supabase
        .from('connection_properties')
        .select(`
        connection_id,
        property_id,
        cohost_properties (
            id,
            name,
            workspace_id
        )
    `);

    if (mapError) {
        console.error('Error fetching mappings:', mapError);
        return;
    }

    const analysis = {
        safe: [],
        conflict: [],
        orphan: [],
        alreadySet: [],
        total: connections.length
    };

    // Build map: connection_id -> Set<workspace_id>
    const workspaceMap = new Map(); // connectionId -> Set<workspaceId>

    mappings.forEach(m => {
        const cxId = m.connection_id;
        const wsId = m.cohost_properties?.workspace_id;

        if (wsId) {
            if (!workspaceMap.has(cxId)) workspaceMap.set(cxId, new Set());
            workspaceMap.get(cxId).add(wsId);
        }
    });

    // Classify
    for (const cx of connections) {
        if (cx.workspace_id) {
            analysis.alreadySet.push(cx);
            continue;
        }

        const linkedWorkspaces = workspaceMap.get(cx.id);

        if (!linkedWorkspaces || linkedWorkspaces.size === 0) {
            analysis.orphan.push(cx);
        } else if (linkedWorkspaces.size === 1) {
            const wsId = Array.from(linkedWorkspaces)[0];
            analysis.safe.push({ ...cx, targetWorkspaceId: wsId });
        } else {
            const conflictIds = Array.from(linkedWorkspaces);
            analysis.conflict.push({ ...cx, conflictWorkspaceIds: conflictIds });
        }
    }

    console.log(`Total Connections: ${analysis.total}`);
    console.log(`Already Set: ${analysis.alreadySet.length}`);
    console.log(`Safe to Backfill: ${analysis.safe.length}`);
    console.log(`Orphans: ${analysis.orphan.length}`);
    console.log(`Conflicts: ${analysis.conflict.length}`);

    // --- STAGE B: BACKFILL ---
    console.log('\n--- Stage B: Execution ---');

    const updatedIds = [];
    const errors = [];

    if (analysis.safe.length > 0) {
        console.log(`Backfilling ${analysis.safe.length} safe connections...`);

        for (const item of analysis.safe) {
            const { error } = await supabase
                .from('connections')
                .update({ workspace_id: item.targetWorkspaceId })
                .eq('id', item.id)
                .is('workspace_id', null); // Safety check for idempotency race

            if (error) {
                console.error(`Failed to update ${item.id}:`, error.message);
                errors.push(item.id);
            } else {
                updatedIds.push(item.id);
                process.stdout.write('.');
            }
        }
        console.log('\nDone.');
    } else {
        console.log('No safe connections to backfill.');
    }

    // --- STAGE C: REPORT ---
    console.log('\n--- Stage C: Report Generation ---');

    const reportPath = path.join(process.cwd(), 'docs', 'audits', '2026-01-24_backfill_report.md');

    const reportContent = `# Backfill Report: Connections Workspace (Phase 2)

**Date**: ${new Date().toISOString()}
**Total Connections**: ${analysis.total}

## Summary
| Category | Count | Action |
| :--- | :--- | :--- |
| **Safe** | ${analysis.safe.length} | Backfilled |
| **Already Set** | ${analysis.alreadySet.length} | Skipped |
| **Orphans** | ${analysis.orphan.length} | Skipped (Manual Fix Required) |
| **Conflicts** | ${analysis.conflict.length} | Skipped (Manual Fix Required) |

## Rollback SQL
Run this to Undo Stage B changes:
\`\`\`sql
UPDATE connections 
SET workspace_id = NULL 
WHERE id IN (
    ${updatedIds.length > 0 ? updatedIds.map(id => `'${id}'`).join(',\n    ') : "'NO_IDS_UPDATED'"}
);
\`\`\`

## Manual Decision List

### Orphans (No Linked Properties)
These connections have no properties linked, so we cannot infer workspace.
${analysis.orphan.map(c => `- **${c.display_email || c.name || c.id}** (ID: ${c.id})`).join('\n') || 'None'}

### Conflicts (Linked to Multiple Workspaces)
These connections are linked to properties in different workspaces.
${analysis.conflict.map(c => `- **${c.display_email}** (ID: ${c.id}) -> Workspaces: ${c.conflictWorkspaceIds.join(', ')}`).join('\n') || 'None'}
`;

    try {
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, reportContent);
        console.log(`Report saved to: ${reportPath}`);
    } catch (err) {
        console.error('Failed to write report:', err);
    }
}

runBackfill();
