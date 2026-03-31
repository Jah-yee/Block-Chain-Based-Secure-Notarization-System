-- Migration: 006_fix_enum_and_column_additions.sql
-- Fix ENUM conversion for status columns and add any missing columns

-- DOCUMENTS TABLE: Convert status to ENUM
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status_enum') THEN
        CREATE TYPE document_status_enum AS ENUM ('pending', 'uploaded', 'approved', 'rejected');
    END IF;
END$$;

ALTER TABLE documents ALTER COLUMN status DROP DEFAULT;
ALTER TABLE documents ALTER COLUMN status TYPE document_status_enum USING status::text::document_status_enum;
ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'pending';

-- NTKR_TRANSACTIONS TABLE: Convert status to ENUM
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status_enum') THEN
        CREATE TYPE transaction_status_enum AS ENUM ('pending', 'success', 'failed');
    END IF;
END$$;

ALTER TABLE ntkr_transactions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE ntkr_transactions ALTER COLUMN status TYPE transaction_status_enum USING status::text::transaction_status_enum;
ALTER TABLE ntkr_transactions ALTER COLUMN status SET DEFAULT 'pending';

-- USERS TABLE: Add missing columns if not present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='wallet_address') THEN
        ALTER TABLE users ADD COLUMN wallet_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='wallet_nonce') THEN
        ALTER TABLE users ADD COLUMN wallet_nonce TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='national_id_hash') THEN
        ALTER TABLE users ADD COLUMN national_id_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kyc_status') THEN
        ALTER TABLE users ADD COLUMN kyc_status VARCHAR(20) DEFAULT 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='notary_pin_hash') THEN
        ALTER TABLE users ADD COLUMN notary_pin_hash TEXT;
    END IF;
END$$;

-- NTKR_TRANSACTIONS TABLE: Add confirmed_on_chain if not present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ntkr_transactions' AND column_name='confirmed_on_chain') THEN
        ALTER TABLE ntkr_transactions ADD COLUMN confirmed_on_chain BOOLEAN DEFAULT false;
    END IF;
END$$;

-- End of migration
