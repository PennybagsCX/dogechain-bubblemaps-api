require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function checkTestToken() {
  const sql = neon(process.env.DATABASE_URL);

  const result = await sql`
    SELECT *
    FROM trending_searches
    WHERE address = '0x1234567890123456789012345678901234567890'
  `;

  if (result.length > 0) {
    console.log('Test token found:');
    console.log(`  Address: ${result[0].address}`);
    console.log(`  Symbol: ${result[0].symbol}`);
    console.log(`  Search Count: ${result[0].search_count}`);
    console.log(`  Updated: ${result[0].updated_at}`);
  } else {
    console.log('Test token not found');
  }
}

checkTestToken();
