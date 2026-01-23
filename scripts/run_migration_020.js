const fs = require('fs');

async function runMigration() {
    console.log('Running migration 020 (Connections Tables)...');
    console.log('⚠️ Please run this SQL manually in Supabase SQL Editor:');
    console.log('\n---------------------------------------------------');
    const sql = fs.readFileSync('scripts/migrations/020_create_connections.sql', 'utf8');
    console.log(sql);
    console.log('---------------------------------------------------\n');
}

runMigration();
