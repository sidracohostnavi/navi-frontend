const fs = require('fs');

async function runMigration() {
    console.log('Running migration 021 (Update Platforms)...');
    console.log('⚠️ Please run this SQL manually in Supabase SQL Editor:');
    console.log('\n---------------------------------------------------');
    const sql = fs.readFileSync('scripts/migrations/021_update_connections_platforms.sql', 'utf8');
    console.log(sql);
    console.log('---------------------------------------------------\n');
}

runMigration();
