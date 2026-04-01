-- Migration: Wallet Normalization & Uniqueness
-- Ensures all wallet addresses are unique in a case-insensitive manner (LOWER)
-- and prepares for a pure wallet-based identity model.

-- 1. Standardize existing data (lowercase)
UPDATE users SET wallet_address = LOWER(wallet_address) WHERE wallet_address IS NOT NULL;

-- 2. Add Unique Index on LOWER(wallet_address)
-- This prevents '0xABC' and '0xabc' from being treated as different users.
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_lower_unique ON users (LOWER(wallet_address));

-- 3. Cleanup: Ensure future inserts don't bypass this with nulls if we want it mandatory
-- (Already handled by 20241004120091_add_name_and_wallet_required.sql)
