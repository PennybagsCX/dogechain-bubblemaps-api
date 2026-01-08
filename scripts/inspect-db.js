require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function inspectDatabase() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('🔍 Inspecting database structure...\n');

  // Get all tables
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  console.log('📋 Tables found:');
  tables.forEach(t => console.log(`  - ${t.table_name}`));
  console.log('');

  // Check search_events table structure
  if (tables.some(t => t.table_name === 'search_events')) {
    console.log('🔎 search_events table structure:');
    const columns = await sql`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'search_events'
      ORDER BY ordinal_position
    `;

    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'} ${col.column_default ? `default ${col.column_default}` : ''}`);
    });
    console.log('');

    // Get record count
    const count = await sql`SELECT COUNT(*) as count FROM search_events`;
    console.log(`📊 Records in search_events: ${count[0].count}\n`);
  }

  // Check views
  const views = await sql`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  if (views.length > 0) {
    console.log('👁️  Views found:');
    views.forEach(v => console.log(`  - ${v.table_name}`));
    console.log('');
  } else {
    console.log('❌ No views found\n');
  }

  // Check recent records
  const recent = await sql`
    SELECT *
    FROM search_events
    ORDER BY created_at DESC
    LIMIT 5
  `;

  if (recent.length > 0) {
    console.log('📝 Recent records:');
    recent.forEach(r => {
      console.log(`  - ${r.address} | ${r.asset_type} | ${r.symbol || 'N/A'} | ${r.created_at}`);
    });
    console.log('');
  }
}

inspectDatabase().catch(console.error);
