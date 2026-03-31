-- Migration: Update amount constraint to allow 0 for approval transactions

ALTER TABLE ntkr_transactions DROP CONSTRAINT IF EXISTS check_amount_positive;

-- Use a more flexible constraint that checks the tx_type column
ALTER TABLE ntkr_transactions ADD CONSTRAINT check_amount_positive_or_zero_for_approval
CHECK (
  CASE
    WHEN tx_type::text = 'approval' THEN amount >= 0
    ELSE amount > 0
  END
);
