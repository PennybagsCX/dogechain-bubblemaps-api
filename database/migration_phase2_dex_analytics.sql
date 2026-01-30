-- DEX Analytics Phase 2 Migration
-- Adds support for trading volume, OHLCV data, and enhanced metrics

-- =====================================================
-- Update dex_pools table with trading metrics
-- =====================================================

ALTER TABLE dex_pools
ADD COLUMN IF NOT EXISTS volume_24h_usd NUMERIC(38, 18) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_change_24h NUMERIC(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS market_cap_usd NUMERIC(38, 18) DEFAULT 0,
ADD COLUMN IF NOT EXISTS transactions_24h INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_volume_update TIMESTAMP DEFAULT NOW();

-- Add index for volume-based queries
CREATE INDEX IF NOT EXISTS idx_dex_pools_volume_24h
ON dex_pools(volume_24h_usd DESC)
WHERE volume_24h_usd > 0;

-- =====================================================
-- Create dex_pool_history table for OHLCV persistence
-- =====================================================

CREATE TABLE IF NOT EXISTS dex_pool_history (
  id SERIAL PRIMARY KEY,
  pool_address VARCHAR(42) NOT NULL,
  timeframe VARCHAR(10) NOT NULL, -- '1h', '6h', '1d'
  timestamp BIGINT NOT NULL,
  open_price NUMERIC(38, 18),
  high_price NUMERIC(38, 18),
  low_price NUMERIC(38, 18),
  close_price NUMERIC(38, 18),
  volume_usd NUMERIC(38, 18),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(pool_address, timeframe, timestamp)
);

-- Indexes for efficient OHLCV queries
CREATE INDEX IF NOT EXISTS idx_pool_history_pool_time
ON dex_pool_history(pool_address, timeframe, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pool_history_timestamp
ON dex_pool_history(timestamp DESC);

-- =====================================================
-- Create chain_metrics table for network-level statistics
-- =====================================================

CREATE TABLE IF NOT EXISTS chain_metrics (
  id SERIAL PRIMARY KEY,
  chain_name VARCHAR(50) NOT NULL UNIQUE,
  total_tvl_usd NUMERIC(38, 18) DEFAULT 0,
  dex_volume_24h_usd NUMERIC(38, 18) DEFAULT 0,
  dex_volume_7d_usd NUMERIC(38, 18) DEFAULT 0,
  active_pools INTEGER DEFAULT 0,
  daily_users INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for chain lookups
CREATE INDEX IF NOT EXISTS idx_chain_metrics_name
ON chain_metrics(chain_name);

-- =====================================================
-- Create metrics_history table for chain trends
-- =====================================================

CREATE TABLE IF NOT EXISTS metrics_history (
  id SERIAL PRIMARY KEY,
  chain_name VARCHAR(50) NOT NULL,
  total_tvl_usd NUMERIC(38, 18),
  dex_volume_24h_usd NUMERIC(38, 18),
  active_pools INTEGER,
  daily_users INTEGER,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_metrics_history_chain_time
ON metrics_history(chain_name, recorded_at DESC);

-- =====================================================
-- Create function to update chain_metrics timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_chain_metrics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_update_chain_metrics_timestamp ON chain_metrics;
CREATE TRIGGER trigger_update_chain_metrics_timestamp
BEFORE UPDATE ON chain_metrics
FOR EACH ROW
EXECUTE FUNCTION update_chain_metrics_timestamp();

-- =====================================================
-- Insert Dogechain metrics entry (if not exists)
-- =====================================================

INSERT INTO chain_metrics (
  chain_name,
  total_tvl_usd,
  dex_volume_24h_usd,
  dex_volume_7d_usd,
  active_pools,
  daily_users
) VALUES (
  'dogechain',
  0,
  0,
  0,
  0,
  0
)
ON CONFLICT (chain_name) DO NOTHING;

-- =====================================================
-- Grant permissions (adjust as needed for your setup)
-- =====================================================

-- GRANT SELECT, INSERT, UPDATE ON dex_pool_history TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE ON chain_metrics TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE ON metrics_history TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE dex_pool_history_id_seq TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE chain_metrics_id_seq TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE metrics_history_id_seq TO your_app_user;

-- =====================================================
-- Verification queries
-- =====================================================

-- Check new columns on dex_pools
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'dex_pools'
-- AND column_name IN ('volume_24h_usd', 'price_change_24h', 'market_cap_usd', 'transactions_24h');

-- Check new tables
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_name IN ('dex_pool_history', 'chain_metrics', 'metrics_history');
