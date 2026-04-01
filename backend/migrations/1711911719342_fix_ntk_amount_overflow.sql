-- Fix numeric overflow in ntk_mint_audit.amount column
-- Change from DECIMAL(20, 18) to DECIMAL(30, 18) to allow values up to 999999999999.999...

ALTER TABLE ntk_mint_audit 
ALTER COLUMN amount TYPE DECIMAL(30, 18);

-- Update default value
ALTER TABLE ntk_mint_audit 
ALTER COLUMN amount SET DEFAULT 100;
