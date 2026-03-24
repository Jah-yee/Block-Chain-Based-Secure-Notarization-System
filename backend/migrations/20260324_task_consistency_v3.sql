-- Migration: Add Hardened Transaction Consistency Fields
-- Goal: Enable atomic claiming, idempotency locks, and crash-safe recovery.

DO $$ 
BEGIN
    -- 1. Create tx_status enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_status_type') THEN
        CREATE TYPE tx_status_type AS ENUM ('initiated', 'pending', 'confirmed', 'failed');
    END IF;
END $$;

-- 2. Update users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS tx_status tx_status_type,
ADD COLUMN IF NOT EXISTS tx_hash TEXT,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP;

-- 3. Update documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS tx_status tx_status_type,
ADD COLUMN IF NOT EXISTS tx_hash TEXT,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP;

-- 4. Indices for recovery worker performance
CREATE INDEX IF NOT EXISTS idx_users_tx_status ON users(tx_status) WHERE tx_status IN ('initiated', 'pending');
CREATE INDEX IF NOT EXISTS idx_docs_tx_status ON documents(tx_status) WHERE tx_status IN ('initiated', 'pending');
