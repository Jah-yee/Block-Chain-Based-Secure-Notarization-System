-- Migration: 007_blockchain_logical_crud.sql
-- Enforces blockchain-logical constraints and adds missing fields

-- DOCUMENTS TABLE
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS deleted_flag BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- NTKR_TRANSACTIONS TABLE
ALTER TABLE ntkr_transactions
    ADD COLUMN IF NOT EXISTS tx_type VARCHAR(20) DEFAULT 'credit';

-- Enums for kyc_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status_enum') THEN
        CREATE TYPE kyc_status_enum AS ENUM ('pending', 'verified', 'rejected');
    END IF;
END$$;

ALTER TABLE users
    ALTER COLUMN kyc_status DROP DEFAULT,
    ALTER COLUMN kyc_status TYPE kyc_status_enum USING kyc_status::kyc_status_enum,
    ALTER COLUMN kyc_status SET DEFAULT 'pending';

-- Enums for tx_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_type_enum') THEN
        CREATE TYPE tx_type_enum AS ENUM ('credit', 'debit');
    END IF;
END$$;

ALTER TABLE ntkr_transactions
    ALTER COLUMN tx_type TYPE tx_type_enum USING tx_type::tx_type_enum;

-- Constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'check_amount_positive') THEN
        ALTER TABLE ntkr_transactions ADD CONSTRAINT check_amount_positive CHECK (amount > 0);
    END IF;
END$$;

-- End of migration
