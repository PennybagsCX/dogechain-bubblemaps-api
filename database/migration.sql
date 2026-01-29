-- Migration script for Dogechain Bubblemaps API
-- Run this in your Neon database SQL Editor
-- https://console.neon.tech

-- Create search_events table
-- Stores individual search queries for trending calculation
CREATE TABLE IF NOT EXISTS search_events (
  id SERIAL PRIMARY KEY,
  address VARCHAR(42) NOT NULL,
  asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('TOKEN', 'NFT')),
  symbol VARCHAR(50),
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_search_events_address ON search_events(address);
CREATE INDEX IF NOT EXISTS idx_search_events_asset_type ON search_events(asset_type);
CREATE INDEX IF NOT EXISTS idx_search_events_created_at ON search_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_composite ON search_events(asset_type, created_at DESC);

-- Create view for trending calculation
-- Computes velocity scores based on recent vs previous search activity
CREATE OR REPLACE VIEW trending_assets_view AS
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
ORDER BY velocity_score DESC, total_searches DESC;

-- Create a function to clean up old search events (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_search_events()
RETURNS void AS $$
BEGIN
  DELETE FROM search_events
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Comment the function
COMMENT ON FUNCTION cleanup_old_search_events IS
'Deletes search events older than 90 days to prevent database bloat';

-- Create dex_pools table for DEX liquidity pool analytics
-- Stores pool data including reserves, TVL, and metadata
CREATE TABLE IF NOT EXISTS dex_pools (
  id SERIAL PRIMARY KEY,
  pool_address VARCHAR(42) NOT NULL UNIQUE,
  token0_address VARCHAR(42) NOT NULL,
  token0_symbol VARCHAR(50),
  token1_address VARCHAR(42) NOT NULL,
  token1_symbol VARCHAR(50),
  factory_name VARCHAR(100) NOT NULL,
  reserve0 NUMERIC(78, 0) DEFAULT 0,
  reserve1 NUMERIC(78, 0) DEFAULT 0,
  tvl_usd NUMERIC(38, 18) DEFAULT 0,
  lp_token_supply NUMERIC(78, 0) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for dex_pools table
CREATE INDEX IF NOT EXISTS idx_dex_pools_pool_address ON dex_pools(pool_address);
CREATE INDEX IF NOT EXISTS idx_dex_pools_factory_name ON dex_pools(factory_name);
CREATE INDEX IF NOT EXISTS idx_dex_pools_tvl_usd ON dex_pools(tvl_usd DESC);
CREATE INDEX IF NOT EXISTS idx_dex_pools_created_at ON dex_pools(created_at DESC);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dex_pools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dex_pools_updated_at
  BEFORE UPDATE ON dex_pools
  FOR EACH ROW
  EXECUTE FUNCTION update_dex_pools_updated_at();

-- Verify the setup
SELECT
  'search_events table' as object_name,
  COUNT(*) as record_count
FROM search_events
UNION ALL
SELECT
  'trending_assets_view view',
  COUNT(*)
FROM trending_assets_view
UNION ALL
SELECT
  'dex_pools table',
  COUNT(*)
FROM dex_pools;
