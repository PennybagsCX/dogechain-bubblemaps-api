require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function checkTrendingData() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('📊 Checking trending_searches data...\n');

  // Get sample records
  const records = await sql`
    SELECT *
    FROM trending_searches
    ORDER BY search_count DESC
    LIMIT 5
  `;

  console.log('Top 5 trending tokens:');
  records.forEach(r => {
    console.log(`  - ${r.symbol || 'N/A'} (${r.address?.substring(0, 10)}...)`);
    console.log(`    Type: ${r.asset_type} | Searches: ${r.search_count}`);
    console.log(`    Created: ${r.created_at} | Updated: ${r.updated_at}\n`);
  });

  // Get total count
  const count = await sql`SELECT COUNT(*) as count FROM trending_searches`;
  console.log(`📊 Total records: ${count[0].count}\n`);
}

checkTrendingData();
