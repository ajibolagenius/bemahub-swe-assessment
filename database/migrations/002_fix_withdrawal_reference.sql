-- 002_fix_withdrawal_reference.sql
-- This migration cleans up duplicates and enforces uniqueness on (instructor_id, payout_reference).

-- Step 1: Remove any duplicate rows that would prevent creating the unique index,
DELETE w1 FROM wp_bl_withdrawals w1
INNER JOIN wp_bl_withdrawals w2
WHERE w1.id > w2.id
  AND w1.instructor_id = w2.instructor_id
  AND w1.payout_reference = w2.payout_reference;

-- Step 2: Drop the ineffective composite key.
ALTER TABLE wp_bl_withdrawals DROP INDEX uq_reference;

-- Step 3: Add the corrected unique key on instructor_id and payout_reference.
ALTER TABLE wp_bl_withdrawals ADD UNIQUE KEY uq_reference (instructor_id, payout_reference);
