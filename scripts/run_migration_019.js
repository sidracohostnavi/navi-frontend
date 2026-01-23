const fs = require('fs');

async function runMigration() {
    console.log('Running migration 019 (Debug Fields)...');
    console.log('⚠️ Please run this SQL manually in Supabase SQL Editor:');
    console.log('\n---------------------------------------------------');
    const sql = fs.readFileSync('scripts/migrations/019_add_ical_debug_fields.sql', 'utf8');
    console.log(sql);
    console.log('---------------------------------------------------\n');
}

runMigration();
