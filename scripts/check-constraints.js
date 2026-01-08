require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function checkConstraints() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('🔍 Checking constraints on trending_searches...\n');

  const constraints = await sql`
    SELECT
      constraint_name,
      constraint_type
    FROM information_schema.table_constraints
    WHERE table_name = 'trending_searches'
  `;

  console.log('Constraints found:');
  constraints.forEach(c => {
    console.log(`  - ${c.constraint_name}: ${c.constraint_type}`);
  });
  console.log('');

  // Check indexes
  const indexes = await sql`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = 'trending_searches'
  `;

  console.log('Indexes found:');
  indexes.forEach(i => {
    console.log(`  - ${i.indexname}`);
    if (i.indexdef) console.log(`    ${i.indexdef.substring(0, 100)}...`);
  });
  console.log('');
}

checkConstraints();
