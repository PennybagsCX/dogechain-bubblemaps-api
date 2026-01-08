/**
 * Database setup script
 * Checks existing tables and creates them if needed
 */

require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔗 Connecting to database...\n');
  const sql = neon(process.env.DATABASE_URL);

  console.log('🔍 Checking database setup...\n');

  try {
    // Check if search_events table exists
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'search_events'
    `;

    if (tables.length === 0) {
      console.log('❌ search_events table does NOT exist');
      console.log('🔨 Creating search_events table...\n');

      // Create the table
      await sql`
        CREATE TABLE search_events (
          id SERIAL PRIMARY KEY,
          address VARCHAR(42) NOT NULL,
          asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('TOKEN', 'NFT')),
          symbol VARCHAR(50),
          name VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      console.log('✅ search_events table created\n');

      // Create indexes
      await sql`CREATE INDEX idx_search_events_address ON search_events(address)`;
      await sql`CREATE INDEX idx_search_events_asset_type ON search_events(asset_type)`;
      await sql`CREATE INDEX idx_search_events_created_at ON search_events(created_at DESC)`;
      await sql`CREATE INDEX idx_search_events_composite ON search_events(asset_type, created_at DESC)`;
      console.log('✅ Indexes created\n');

    } else {
      console.log('✅ search_events table already exists\n');
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
        FROM search_events
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
      FROM search_events
    `;

    console.log(`📊 Current records in search_events: ${countResult[0].count}\n`);

    // Test by inserting a sample record
    console.log('🧪 Testing database with sample insert...');
    await sql`
      INSERT INTO search_events (address, asset_type, symbol, name)
      VALUES ('0x0000000000000000000000000000000000000000', 'TOKEN', 'TEST', 'Test Token')
    `;
    console.log('✅ Sample insert successful\n');

    // Clean up the test record
    await sql`
      DELETE FROM search_events
      WHERE address = '0x0000000000000000000000000000000000000000'
    `;
    console.log('✅ Test record cleaned up\n');

    console.log('✨ Database setup complete!\n');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();
