-- =====================================================
-- COMBINED ALERTS COUNTER MIGRATION
-- This combines Phase 3 and Phase 4 migrations
-- Run this in your Neon database SQL Editor
-- https://console.neon.tech
-- =====================================================

-- =====================================================
-- PHASE 3: Create Alerts Counter System
-- =====================================================

-- Create triggered_alerts table (if not exists)
CREATE TABLE IF NOT EXISTS triggered_alerts (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(255) NOT NULL,
  alert_name VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  token_address VARCHAR(42),
  token_symbol VARCHAR(50),
  transaction_count INTEGER DEFAULT 0,
  session_id VARCHAR(64),
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint separately (in case table already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_alert_trigger'
  ) THEN
    ALTER TABLE triggered_alerts
    ADD CONSTRAINT unique_alert_trigger
    UNIQUE (alert_id, session_id, triggered_at);
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_alert_id ON triggered_alerts(alert_id);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_wallet_address ON triggered_alerts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_token_address ON triggered_alerts(token_address);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_triggered_at ON triggered_alerts(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_session_id ON triggered_alerts(session_id);

-- Create alert_counters table for atomic counter
CREATE TABLE IF NOT EXISTS alert_counters (
  id SERIAL PRIMARY KEY,
  total_alerts BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the single counter row (should only ever have one row with id=1)
INSERT INTO alert_counters (id, total_alerts, updated_at)
VALUES (1, 0, NOW())
ON CONFLICT (id) DO NOTHING;

-- Initialize counter with existing data (if any)
DO $$
DECLARE
  existing_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM triggered_alerts;

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

-- Create function to increment alert counter on trigger
CREATE OR REPLACE FUNCTION increment_alert_counter_on_trigger()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE alert_counters
  SET total_alerts = total_alerts + 1,
      updated_at = NOW()
  WHERE id = 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic counter increment
DROP TRIGGER IF EXISTS trigger_increment_alert_counter ON triggered_alerts;
CREATE TRIGGER trigger_increment_alert_counter
  AFTER INSERT ON triggered_alerts
  FOR EACH ROW
  EXECUTE FUNCTION increment_alert_counter_on_trigger();

-- Create sync function for maintenance
CREATE OR REPLACE FUNCTION sync_alert_counter()
RETURNS TABLE(current_count BIGINT, table_count BIGINT, difference BIGINT) AS $$
DECLARE
  counter_val BIGINT;
  table_val BIGINT;
BEGIN
  SELECT total_alerts INTO counter_val FROM alert_counters WHERE id = 1;
  SELECT COUNT(*) INTO table_val FROM triggered_alerts;

  IF counter_val != table_val THEN
    UPDATE alert_counters
    SET total_alerts = table_val,
        updated_at = NOW()
    WHERE id = 1;
  END IF;

  RETURN QUERY
  SELECT counter_val, table_val, (table_val - counter_val);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Run verification to confirm setup
SELECT '=== MIGRATION COMPLETE ===' as info;
SELECT '=== VERIFICATION RESULTS ===' as separator;

-- Check tables
SELECT
  table_name,
  '✓ TABLE EXISTS' as status
FROM information_schema.tables
WHERE table_name IN ('triggered_alerts', 'alert_counters')
ORDER BY table_name;

-- Check trigger
SELECT
  trigger_name,
  '✓ TRIGGER EXISTS' as status
FROM information_schema.triggers
WHERE trigger_name = 'trigger_increment_alert_counter';

-- Check counter value
SELECT '=== CURRENT COUNTER VALUE ===' as info;
SELECT * FROM alert_counters;

-- Check triggered_alerts count
SELECT '=== TRIGGERED ALERTS COUNT ===' as info;
SELECT COUNT(*) as total_triggered_alerts FROM triggered_alerts;

-- Run sync to verify consistency
SELECT '=== SYNC STATUS ===' as info;
SELECT * FROM sync_alert_counter();
