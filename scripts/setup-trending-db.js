require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function setupTrendingDatabase() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('🔨 Setting up trending system database...\n');

  try {
    // Check if trending_searches table exists
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'trending_searches'
    `;

    if (tables.length === 0) {
      console.log('❌ trending_searches table does NOT exist');
      console.log('🔨 Creating trending_searches table...\n');

      // Create the table for trending system
      await sql`
        CREATE TABLE trending_searches (
          id SERIAL PRIMARY KEY,
          address VARCHAR(42) NOT NULL,
          asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('TOKEN', 'NFT')),
          symbol VARCHAR(50),
          name VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      console.log('✅ trending_searches table created\n');

      // Create indexes
      await sql`CREATE INDEX idx_trending_searches_address ON trending_searches(address)`;
      await sql`CREATE INDEX idx_trending_searches_asset_type ON trending_searches(asset_type)`;
      await sql`CREATE INDEX idx_trending_searches_created_at ON trending_searches(created_at DESC)`;
      await sql`CREATE INDEX idx_trending_searches_composite ON trending_searches(asset_type, created_at DESC)`;
      console.log('✅ Indexes created\n');

    } else {
      console.log('✅ trending_searches table already exists\n');

      // Verify structure
      const columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'trending_searches'
        ORDER BY ordinal_position
      `;

      console.log('🔎 trending_searches structure:');
      columns.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type}`));
      console.log('');
    }

    // Check if view exists
    const views = await sql`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name = 'trending_assets_view'
    `;

    if (views.length === 0) {
      console.log('❌ trending_assets_view does NOT exist');
      console.log('🔨 Creating trending_assets_view...\n');

      await sql`
        CREATE VIEW trending_assets_view AS
        SELECT
          address,
          asset_type,
          COALESCE(symbol, 'TOKEN') as symbol,
          COALESCE(name, 'Token') as name,
          COUNT(*) as total_searches,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_searches,
          COUNT(CASE
            WHEN created_at <= NOW() - INTERVAL '24 hours'
              AND created_at > NOW() - INTERVAL '48 hours'
            THEN 1
          END) as previous_searches,
          CASE
            WHEN COUNT(CASE
              WHEN created_at <= NOW() - INTERVAL '24 hours'
                AND created_at > NOW() - INTERVAL '48 hours'
              THEN 1
            END) = 0 THEN 0
            ELSE (COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::FLOAT /
                  NULLIF(COUNT(CASE
                    WHEN created_at <= NOW() - INTERVAL '24 hours'
                      AND created_at > NOW() - INTERVAL '48 hours'
                    THEN 1
                  END), 0)) * 100
          END as velocity_score
        FROM trending_searches
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY address, asset_type, symbol, name
        ORDER BY velocity_score DESC, total_searches DESC
      `;
      console.log('✅ trending_assets_view created\n');

    } else {
      console.log('✅ trending_assets_view already exists\n');
    }

    // Check current record count
    const countResult = await sql`
      SELECT COUNT(*) as count
      FROM trending_searches
    `;

    console.log(`📊 Current records in trending_searches: ${countResult[0].count}\n`);

    // Test by inserting a sample record
    console.log('🧪 Testing database with sample insert...');
    await sql`
      INSERT INTO trending_searches (address, asset_type, symbol, name)
      VALUES ('0x0000000000000000000000000000000000000000', 'TOKEN', 'TEST', 'Test Token')
    `;
    console.log('✅ Sample insert successful\n');

    // Test the view
    console.log('🧪 Testing trending_assets_view...');
    const viewResult = await sql`
      SELECT * FROM trending_assets_view
      WHERE address = '0x0000000000000000000000000000000000000000'
    `;

    if (viewResult.length > 0) {
      console.log('✅ View working correctly:');
      console.log(`  - Address: ${viewResult[0].address}`);
      console.log(`  - Symbol: ${viewResult[0].symbol}`);
      console.log(`  - Total Searches: ${viewResult[0].total_searches}`);
      console.log(`  - Velocity Score: ${Math.round(viewResult[0].velocity_score || 0)}\n`);
    }

    // Clean up the test record
    await sql`
      DELETE FROM trending_searches
      WHERE address = '0x0000000000000000000000000000000000000000'
    `;
    console.log('✅ Test record cleaned up\n');

    console.log('✨ Trending database setup complete!\n');

  } catch (error) {
    console.error('❌ Error setting up trending database:', error);
    process.exit(1);
  }
}

setupTrendingDatabase();
