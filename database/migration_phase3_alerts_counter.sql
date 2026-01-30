-- Migration Phase 3: Alerts Counter System
-- This migration creates a proper counter system for tracking total alerts fired
-- Run this in your Neon database SQL Editor: https://console.neon.tech

-- =====================================================
-- Create triggered_alerts table (if not exists)
-- =====================================================

CREATE TABLE IF NOT EXISTS triggered_alerts (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(255) NOT NULL,
  alert_name VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  token_address VARCHAR(42),
  token_symbol VARCHAR(50),
  transaction_count INTEGER DEFAULT 0,
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint separately (in case table already exists)
-- This prevents duplicate alert logging
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_alert_trigger'
  ) THEN
    ALTER TABLE triggered_alerts
    ADD CONSTRAINT unique_alert_trigger
    UNIQUE (alert_id, wallet_address, token_address, triggered_at);
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_alert_id ON triggered_alerts(alert_id);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_wallet_address ON triggered_alerts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_token_address ON triggered_alerts(token_address);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_triggered_at ON triggered_alerts(triggered_at DESC);

-- =====================================================
-- Create alert_counters table for atomic counter
-- =====================================================

CREATE TABLE IF NOT EXISTS alert_counters (
  id SERIAL PRIMARY KEY,
  total_alerts BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the single counter row (should only ever have one row with id=1)
INSERT INTO alert_counters (id, total_alerts, updated_at)
VALUES (1, 0, NOW())
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Initialize counter with existing data (if any)
-- =====================================================

-- Seed the counter with existing count from triggered_alerts
-- This ensures the counter starts at the correct value
DO $$
DECLARE
  existing_count BIGINT;
BEGIN
  -- Get current count from triggered_alerts table
  SELECT COUNT(*) INTO existing_count FROM triggered_alerts;

  -- Update the counter (only if there are existing records)
  IF existing_count > 0 THEN
    UPDATE alert_counters
    SET total_alerts = existing_count,
        updated_at = NOW()
    WHERE id = 1;

    RAISE NOTICE 'Initialized alert counter with existing count: %', existing_count;
  ELSE
    RAISE NOTICE 'No existing triggered_alerts found. Counter initialized to 0.';
  END IF;
END $$;

-- =====================================================
-- Create function to atomically increment alert counter
-- =====================================================

CREATE OR REPLACE FUNCTION increment_alert_counter()
RETURNS BIGINT AS $$
DECLARE
  new_count BIGINT;
BEGIN
  -- Increment the counter and return the new value
  UPDATE alert_counters
  SET total_alerts = total_alerts + 1,
      updated_at = NOW()
  WHERE id = 1
  RETURNING total_alerts INTO new_count;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Create trigger for automatic counter increment
-- =====================================================

-- Function to increment counter after INSERT
CREATE OR REPLACE FUNCTION increment_alert_counter_on_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment the alert counter atomically
  UPDATE alert_counters
  SET total_alerts = total_alerts + 1,
      updated_at = NOW()
  WHERE id = 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger that fires after each alert is logged
DROP TRIGGER IF EXISTS trigger_increment_alert_counter ON triggered_alerts;
CREATE TRIGGER trigger_increment_alert_counter
  AFTER INSERT ON triggered_alerts
  FOR EACH ROW
  EXECUTE FUNCTION increment_alert_counter_on_trigger();

-- =====================================================
-- Create function to manually sync counter (for maintenance)
-- =====================================================

CREATE OR REPLACE FUNCTION sync_alert_counter()
RETURNS TABLE(current_count BIGINT, table_count BIGINT, difference BIGINT) AS $$
DECLARE
  counter_val BIGINT;
  table_val BIGINT;
BEGIN
  -- Get current counter value
  SELECT total_alerts INTO counter_val FROM alert_counters WHERE id = 1;

  -- Get actual count from table
  SELECT COUNT(*) INTO table_val FROM triggered_alerts;

  -- Update counter if out of sync
  IF counter_val != table_val THEN
    UPDATE alert_counters
    SET total_alerts = table_val,
        updated_at = NOW()
    WHERE id = 1;
  END IF;

  -- Return comparison
  RETURN QUERY
  SELECT counter_val, table_val, (table_val - counter_val);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_alert_counter() IS
'Syncs the alert counter with the actual count of rows in triggered_alerts table. Useful for maintenance if counter gets out of sync.';

-- =====================================================
-- Verification queries
-- =====================================================

-- Check table creation
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('triggered_alerts', 'alert_counters');

-- Check counter value
-- SELECT * FROM alert_counters;

-- Check triggered_alerts count
-- SELECT COUNT(*) as total_triggered FROM triggered_alerts;

-- Run sync to verify consistency
-- SELECT * FROM sync_alert_counter();

-- =====================================================
-- Notes
-- =====================================================

-- This migration creates:
-- 1. triggered_alerts table with proper schema and indexes
-- 2. alert_counters table with a single row for O(1) counter reads
-- 3. Automatic trigger to increment counter on each INSERT
-- 4. Maintenance function to sync counter if needed
--
-- The counter is now:
-- - Atomic: Uses database trigger for consistency
-- - Fast: O(1) read instead of COUNT(*)
-- - Reliable: Uses database constraints for uniqueness
-- - Maintained: Trigger handles increment automatically
--
-- After this migration, update the API to:
-- - Read counter from alert_counters.total_alerts instead of COUNT(*)
-- - Continue inserting into triggered_alerts (trigger handles counter)
