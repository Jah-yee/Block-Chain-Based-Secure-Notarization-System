-- Migration: 005_update_schema_for_business_logic.sql
-- Adds missing columns and constraints to users, documents, ntkr_transactions tables

-- USERS TABLE
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS wallet_address TEXT,
    ADD COLUMN IF NOT EXISTS wallet_nonce TEXT,
    ADD COLUMN IF NOT EXISTS national_id_hash TEXT,
    ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS notary_pin_hash TEXT;

-- DOCUMENTS TABLE
ALTER TABLE documents
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS status VARCHAR(20);

-- Optionally, convert status to ENUM (Postgres 9.1+)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status_enum') THEN
        CREATE TYPE document_status_enum AS ENUM ('pending', 'uploaded', 'approved', 'rejected');
    END IF;
END$$;

ALTER TABLE documents
    ALTER COLUMN status TYPE document_status_enum USING status::document_status_enum;

ALTER TABLE documents
    ALTER COLUMN status SET DEFAULT 'pending';

-- NTKR_TRANSACTIONS TABLE
ALTER TABLE ntkr_transactions
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE ntkr_transactions
    ADD COLUMN IF NOT EXISTS confirmed_on_chain BOOLEAN DEFAULT false;

-- Optionally, convert status to ENUM
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status_enum') THEN
        CREATE TYPE transaction_status_enum AS ENUM ('pending', 'success', 'failed');
    END IF;
END$$;

ALTER TABLE ntkr_transactions
    ALTER COLUMN status TYPE transaction_status_enum USING status::transaction_status_enum;

ALTER TABLE ntkr_transactions
    ALTER COLUMN status SET DEFAULT 'pending';

-- Make document_id nullable only for reward type (enforced in API, not DB)
-- Add comments for future audit/versioning tables
-- -- CREATE TABLE document_versions (...)
-- -- CREATE TABLE document_hash_history (...)

-- End of migration
