-- Migration: 20260330_production_final_hygiene.sql
-- Goal: Ensure consistency for all background workers (Reconciliation, Reputation, Identity Sync, Cleanup)
-- Rule: Runs after all baseline migrations to finalize column/constraint state.

-- 1. USERS TABLE
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reputation_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS correlation_id TEXT,
ADD COLUMN IF NOT EXISTS liveness_status VARCHAR(20) DEFAULT 'unverified',
ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN DEFAULT false;

-- 2. DOCUMENTS TABLE
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS chain_confirmed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_tx_hash TEXT,
ADD COLUMN IF NOT EXISTS document_summary TEXT,
ADD COLUMN IF NOT EXISTS submission_state VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- 3. NOTARY APPLICATIONS TABLE
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notary_applications') THEN
        ALTER TABLE notary_applications 
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS national_id_number TEXT;
    END IF;
END $$;

-- 4. WALLET NONCES TABLE (Missing purpose column)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet_nonces') THEN
        ALTER TABLE wallet_nonces ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) DEFAULT 'LOGIN';
    END IF;
END $$;

-- 5. RATE LIMITS TABLE
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 1,
    reset_at TIMESTAMP WITH TIME ZONE,
    violations INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
