const fs = require('fs');

async function runMigration() {
    console.log('Running migration 022 (Add Connection Name)...');
    console.log('⚠️ Please run this SQL manually in Supabase SQL Editor:');
    console.log('\n---------------------------------------------------');
    const sql = fs.readFileSync('scripts/migrations/022_add_connection_name.sql', 'utf8');
    console.log(sql);
    console.log('---------------------------------------------------\n');
}

runMigration();
