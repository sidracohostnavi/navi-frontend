const fs = require('fs');

async function runMigration() {
    console.log('Running migration 024 (Enrichment Schema)...');
    console.log('⚠️ Please run this SQL manually in Supabase SQL Editor:');
    console.log('\n---------------------------------------------------');
    const sql = fs.readFileSync('scripts/migrations/024_enrichment_schema.sql', 'utf8');
    console.log(sql);
    console.log('---------------------------------------------------\n');
}

runMigration();
