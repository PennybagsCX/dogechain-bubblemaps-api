-- =====================================================
-- Alerts Counter Verification Script
-- Run this in your Neon database SQL Editor
-- https://console.neon.tech
-- =====================================================

-- Step 1: Check if required tables exist
SELECT '=== TABLES CHECK ===' as info;
SELECT
  table_name,
  CASE
    WHEN table_name IN ('triggered_alerts', 'alert_counters', 'token_interactions')
    THEN '✓ EXISTS'
    ELSE '✗ MISSING'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('triggered_alerts', 'alert_counters', 'token_interactions')
ORDER BY table_name;

-- Step 2: Check if the trigger exists
SELECT '' as separator;
SELECT '=== TRIGGER CHECK ===' as info;
SELECT
  trigger_name,
  CASE
    WHEN trigger_name = 'trigger_increment_alert_counter' THEN '✓ EXISTS'
    ELSE '✗ MISSING'
  END as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'triggered_alerts';

-- Step 3: Check alert_counters table
SELECT '' as separator;
SELECT '=== ALERT COUNTERS ===' as info;
SELECT * FROM alert_counters;

-- Step 4: Check actual triggered_alerts count
SELECT '' as separator;
SELECT '=== TRIGGERED ALERTS COUNT ===' as info;
SELECT COUNT(*) as total_triggered_alerts FROM triggered_alerts;

-- Step 5: Check unique constraints
SELECT '' as separator;
SELECT '=== CONSTRAINTS CHECK ===' as info;
SELECT
  constraint_name,
  '✓ EXISTS' as status
FROM information_schema.table_constraints
WHERE table_name = 'triggered_alerts'
  AND constraint_type = 'UNIQUE';

-- Step 6: Check if session_id column exists
SELECT '' as separator;
SELECT '=== COLUMNS CHECK ===' as info;
SELECT
  column_name,
  data_type,
  is_nullable,
  '✓ EXISTS' as status
FROM information_schema.columns
WHERE table_name = 'triggered_alerts'
  AND column_name = 'session_id';

-- Step 7: Run sync function to check for discrepancies
SELECT '' as separator;
SELECT '=== SYNC CHECK ===' as info;
SELECT * FROM sync_alert_counter();

-- =====================================================
-- Summary
-- =====================================================
-- If all checks show ✓ EXISTS, the database is properly set up.
-- If any show ✗ MISSING, run the corresponding migration:
-- - migration_phase3_alerts_counter.sql
-- - migration_phase4_fix_unique_constraint.sql
