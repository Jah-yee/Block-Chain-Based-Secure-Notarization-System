-- ============================================
-- HYGIENE & HARDENING CONSOLIDATED MIGRATION
-- Date: 2026-01-22 (Hardened: 2026-02-05)
-- ============================================

-- 1. CLEANUP & CONSTRAINTS: Users Table
ALTER TABLE users DROP CONSTRAINT IF EXISTS unique_email;
ALTER TABLE users DROP CONSTRAINT IF EXISTS unique_wallet;

-- Add CHECK constraint for roles to ensure data integrity at the DB level
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role_valid;
ALTER TABLE users ADD CONSTRAINT check_role_valid CHECK (role IN ('user', 'notary', 'admin'));

-- 2. INTEGRITY: Tighten Critical NOT NULL Constraints & Defaults
UPDATE users SET role = 'user' WHERE role IS NULL;
UPDATE users SET kyc_verified = false WHERE kyc_verified IS NULL;
UPDATE users SET is_deactivated = false WHERE is_deactivated IS NULL;

ALTER TABLE users 
    ALTER COLUMN role SET NOT NULL,
    ALTER COLUMN role SET DEFAULT 'user',
    ALTER COLUMN kyc_verified SET NOT NULL,
    ALTER COLUMN kyc_verified SET DEFAULT false,
    ALTER COLUMN is_deactivated SET NOT NULL,
    ALTER COLUMN is_deactivated SET DEFAULT false;

-- Handle kyc_status or liveness_status rename defensively
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_status') THEN
        UPDATE users SET kyc_status = 'pending' WHERE kyc_status IS NULL;
        ALTER TABLE users ALTER COLUMN kyc_status SET NOT NULL;
        ALTER TABLE users ALTER COLUMN kyc_status SET DEFAULT 'pending';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'liveness_status') THEN
        UPDATE users SET liveness_status = 'pending' WHERE liveness_status IS NULL;
        ALTER TABLE users ALTER COLUMN liveness_status SET NOT NULL;
        ALTER TABLE users ALTER COLUMN liveness_status SET DEFAULT 'pending';
    END IF;
END $$;

-- 3. UNIQUENESS: Disallow ANY duplicate file hashes globally (Deduplication)
-- This enforces "Global Uniqueness" as per architectural requirements.
DELETE FROM documents a USING documents b 
WHERE a.id < b.id AND a.file_hash = b.file_hash;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS unique_user_file_hash;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS unique_global_file_hash;
ALTER TABLE documents ADD CONSTRAINT unique_global_file_hash UNIQUE (file_hash);

-- 4. COMPLETION: Create missing Deletion Log table
CREATE TABLE IF NOT EXISTS document_deletion_log (
    id SERIAL PRIMARY KEY,
    document_id INT NOT NULL,
    deleted_by_wallet VARCHAR(100) NOT NULL,
    reason TEXT,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. AUDIT: Fix transactions status and amount constraints
UPDATE ntkr_transactions SET status = 'pending' WHERE status IS NULL;
ALTER TABLE ntkr_transactions 
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'pending';

-- Prevent negative balances or invalid transaction amounts
ALTER TABLE ntkr_transactions DROP CONSTRAINT IF EXISTS check_amount_positive;
ALTER TABLE ntkr_transactions ADD CONSTRAINT check_amount_positive CHECK (amount >= 0);

-- 6. AUDIT: Ensure tx_hash is unique when provided
CREATE UNIQUE INDEX IF NOT EXISTS unique_tx_hash 
ON ntkr_transactions(tx_hash) 
WHERE tx_hash IS NOT NULL;
