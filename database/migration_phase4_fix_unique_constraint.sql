-- Migration Phase 4: Fix Unique Constraint for Alert Triggers
-- This migration fixes the unique constraint to prevent silent failures
-- Run this in your Neon database SQL Editor: https://console.neon.tech

-- =====================================================
-- Add session_id column to triggered_alerts table
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'triggered_alerts' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE triggered_alerts ADD COLUMN session_id VARCHAR(64);
    RAISE NOTICE 'Added session_id column to triggered_alerts';
  ELSE
    RAISE NOTICE 'session_id column already exists in triggered_alerts';
  END IF;
END $$;

-- =====================================================
-- Drop old unique constraint if it exists
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_alert_trigger'
  ) THEN
    ALTER TABLE triggered_alerts DROP CONSTRAINT unique_alert_trigger;
    RAISE NOTICE 'Dropped old unique_alert_trigger constraint';
  ELSE
    RAISE NOTICE 'No existing unique_alert_trigger constraint to drop';
  END IF;
END $$;

-- =====================================================
-- Create new unique constraint with session_id
-- =====================================================

-- The new constraint uses (alert_id, session_id, triggered_at)
-- This allows the same alert to fire multiple times as long as:
-- - It's from different sessions OR
-- - It happens at different times
ALTER TABLE triggered_alerts
ADD CONSTRAINT unique_alert_trigger
UNIQUE (alert_id, session_id, triggered_at);

RAISE NOTICE 'Created new unique_alert_trigger constraint with session_id';

-- =====================================================
-- Add index for session_id for better query performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_triggered_alerts_session_id
ON triggered_alerts(session_id);

RAISE NOTICE 'Created index on session_id column';

-- =====================================================
-- Verification queries
-- =====================================================

-- Check table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'triggered_alerts'
-- ORDER BY ordinal_position;

-- Check constraints
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_name = 'triggered_alerts';

-- Check indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'triggered_alerts';

-- =====================================================
-- Notes
-- =====================================================

-- This migration:
-- 1. Adds session_id column to distinguish between different trigger events
-- 2. Updates the unique constraint to include session_id
-- 3. Prevents silent failures when the same alert fires multiple times
--
-- After this migration:
-- - Alert triggers from different sessions will always be logged
-- - The same alert can fire multiple times (as it should)
-- - Each trigger event is uniquely identified by (alert_id, session_id, triggered_at)
