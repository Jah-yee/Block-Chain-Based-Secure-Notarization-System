-- RESET PASSWORD AND INITIALIZE
ALTER USER postgres PASSWORD 'postgres';

-- FILE: 20241004120001_create_users.sql

-- ==============================
-- Module 1: Users Table
-- Full initial migration for backend
-- ==============================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    wallet_address VARCHAR(100) UNIQUE,              -- public wallet
    national_id_hash TEXT,                            -- hashed national ID
    consent_timestamp TIMESTAMP,                      -- GDPR/consent
    role VARCHAR(20) DEFAULT 'user',                 -- user / notary
    notary_pin_hash TEXT,                             -- hashed PIN for notary approve/reject
    kyc_verified BOOLEAN DEFAULT FALSE,              -- true if KYC/liveness passed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();


-- FILE: 20241004120011_create_documents.sql
-- ==============================
-- Module 1: Documents Table
-- ==============================

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    filepath VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,
    ntkr_sent NUMERIC(18,8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    notary_id INT REFERENCES users(id),
    approval_tx_hash VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_documents_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;

CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE PROCEDURE update_documents_updated_at_column();


-- FILE: 20241004120021_create_ntkr_transactions.sql
-- ==============================
-- Module 1: NTKR Transactions Table
-- ==============================

CREATE TABLE IF NOT EXISTS ntkr_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    document_id INT REFERENCES documents(id),
    tx_type VARCHAR(20) NOT NULL,        -- request / receive / burn
    amount NUMERIC(18,8) NOT NULL,
    tx_hash VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_ntkr_transactions_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_ntkr_transactions_updated_at ON ntkr_transactions;

CREATE TRIGGER update_ntkr_transactions_updated_at
BEFORE UPDATE ON ntkr_transactions
FOR EACH ROW
EXECUTE PROCEDURE update_ntkr_transactions_updated_at_column();


-- FILE: 20241004120031_add_users_deactivated.sql
-- migrations/004_add_users_deactivated.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;


-- FILE: 20241004120041_update_schema_for_business_logic.sql
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


-- FILE: 20241004120051_fix_enum_and_column_additions.sql
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


-- FILE: 20241004120061_blockchain_logical_crud.sql
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


-- FILE: 20241004120071_alter_file_hash_to_varchar.sql
-- migrations/008_alter_file_hash_to_varchar.sql
ALTER TABLE documents ALTER COLUMN file_hash TYPE VARCHAR(64);


-- FILE: 20241004120081_create_wallet_nonces.sql
-- Migration: 009_create_wallet_nonces.sql
-- Create wallet_nonces table for nonce-based authentication

CREATE TABLE IF NOT EXISTS wallet_nonces (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(100) NOT NULL,
    nonce VARCHAR(64) UNIQUE NOT NULL,
    expiry TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_nonces_wallet_address ON wallet_nonces(wallet_address);


-- FILE: 20241004120091_add_name_and_wallet_required.sql
-- Add name column if not exists and enforce constraints on email and wallet_address
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS name VARCHAR(150);

ALTER TABLE users
    ALTER COLUMN email SET NOT NULL,
    ALTER COLUMN wallet_address SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'unique_email') THEN
        ALTER TABLE users ADD CONSTRAINT unique_email UNIQUE (email);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'unique_wallet') THEN
        ALTER TABLE users ADD CONSTRAINT unique_wallet UNIQUE (wallet_address);
    END IF;
END$$;


-- FILE: 20241004120092_add_note_to_ntkr_transactions.sql
-- Migration: Add note column to ntkr_transactions table for approval/rejection notes

ALTER TABLE ntkr_transactions ADD COLUMN IF NOT EXISTS note TEXT;


-- FILE: 20241004120093_add_approval_to_tx_type_enum.sql
-- Migration: Add 'approval' to tx_type_enum for approval/rejection transactions

ALTER TYPE tx_type_enum ADD VALUE 'approval';


-- FILE: 20241004120095_update_amount_constraint_for_approval.sql
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


-- FILE: 20241004120096_add_liveness_fields_to_users.sql
-- Migration: Add liveness verification fields to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'pending';


-- FILE: 20260106174501_add_audit_trail_to_documents.sql
-- Migration: 202601061745_add_audit_trail_to_documents.sql
-- Adds audit trail columns to the documents table

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS approved_by TEXT;

COMMENT ON COLUMN documents.approved_by IS 'Wallet address of the notary or admin who finalized the document (Approved/Rejected)';
COMMENT ON COLUMN documents.approval_tx_hash IS 'Real blockchain transaction hash from the burn event';


-- FILE: 20260115_add_server_computed_flag.sql
-- Migration: Add server_computed flag to track hash authority
-- Purpose: Distinguish server-computed hashes from client-provided (untrusted) hashes
-- Created: 2026-01-15

-- Add server_computed column
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS server_computed BOOLEAN DEFAULT false;

-- Add index for auditing and filtering
CREATE INDEX IF NOT EXISTS idx_documents_server_computed ON documents(server_computed);

-- Update existing records (mark as untrusted since they used client-provided hashes)
UPDATE documents 
SET server_computed = false 
WHERE server_computed IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN documents.server_computed IS 
'TRUE if hash was computed by server from uploaded file bytes. FALSE if client-provided (UNTRUSTED). Only server-computed hashes should be used for notarization.';

-- Future enforcement (uncomment when all documents use server hash):
-- ALTER TABLE documents ADD CONSTRAINT enforce_server_hash CHECK (server_computed = true);


-- FILE: 20260115_create_ntk_mint_audit.sql
-- Migration: Create NTK Mint Audit Table
-- Purpose: Track all NTK daily mint attempts for accountability and debugging
-- Created: 2026-01-15

CREATE TABLE IF NOT EXISTS ntk_mint_audit (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    wallet_address VARCHAR(42) NOT NULL,
    tx_hash VARCHAR(66),
    relayer_address VARCHAR(42) NOT NULL,
    amount DECIMAL(20, 18) DEFAULT 100,
    status VARCHAR(20) NOT NULL, -- 'SUCCESS' or 'FAILED'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ntk_mint_wallet ON ntk_mint_audit(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ntk_mint_created ON ntk_mint_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_ntk_mint_status ON ntk_mint_audit(status);

-- Comment for documentation
COMMENT ON TABLE ntk_mint_audit IS 'Audit trail for NTK daily mint operations. Records every attempt, success or failure.';
COMMENT ON COLUMN ntk_mint_audit.status IS 'SUCCESS: Mint succeeded on-chain. FAILED: Contract rejected (e.g., already minted today).';


-- FILE: 20260116_create_governance_tables.sql
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_type') THEN
        CREATE TYPE proposal_type AS ENUM ('ban_user', 'unban_user', 'override_document', 'system_upgrade');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_status') THEN
        CREATE TYPE proposal_status AS ENUM ('active', 'passed', 'rejected', 'executed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vote_decision') THEN
        CREATE TYPE vote_decision AS ENUM ('approve', 'reject');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS governance_proposals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type proposal_type NOT NULL,
    target_id VARCHAR(255), -- ID of user or document being targeted
    proposer_id INTEGER REFERENCES users(id),
    status proposal_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS governance_votes (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER REFERENCES governance_proposals(id) ON DELETE CASCADE,
    voter_id INTEGER REFERENCES users(id),
    decision vote_decision NOT NULL,
    signature TEXT NOT NULL, -- EIP-191 verify signature of decision
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proposal_id, voter_id) -- One vote per admin per proposal
);


-- FILE: 20260117_add_nationality_to_notary_apps.sql
ALTER TABLE notary_applications ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);


-- FILE: 20260117_create_notary_applications.sql
CREATE TABLE IF NOT EXISTS notary_applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    license_number VARCHAR(100) NOT NULL,
    experience TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id) -- One active application per user
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_notary_applications_updated_at ON notary_applications;
CREATE TRIGGER update_notary_applications_updated_at
BEFORE UPDATE ON notary_applications
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- FILE: 20260117_update_notary_apps_standalone.sql
-- Remove foreign key dependency as applicant is not yet a user
ALTER TABLE notary_applications DROP CONSTRAINT IF EXISTS notary_applications_user_id_fkey;
ALTER TABLE notary_applications DROP COLUMN IF EXISTS user_id;

-- Add fields required for eventual user creation
ALTER TABLE notary_applications ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE notary_applications ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42);
ALTER TABLE notary_applications ADD COLUMN IF NOT EXISTS national_id_hash VARCHAR(255);
ALTER TABLE notary_applications ADD COLUMN IF NOT EXISTS face_descriptor TEXT; -- Stored as JSON string
ALTER TABLE notary_applications ADD COLUMN IF NOT EXISTS ipfs_cid VARCHAR(255); -- Optional doc proof

-- Ensure uniqueness on applications to prevent spam
ALTER TABLE notary_applications DROP CONSTRAINT IF EXISTS unique_app_wallet;
ALTER TABLE notary_applications DROP CONSTRAINT IF EXISTS unique_app_email;
ALTER TABLE notary_applications ADD CONSTRAINT unique_app_wallet UNIQUE (wallet_address);
ALTER TABLE notary_applications ADD CONSTRAINT unique_app_email UNIQUE (email);


-- FILE: 20260122_hygiene_hardening.sql
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


-- FILE: 20260124_create_auth_nonces.sql
-- Migration: Create auth_nonces table
-- Purpose: Support multi-action nonce-based authentication with upsert capability
-- Created: 2026-01-24

CREATE TABLE IF NOT EXISTS auth_nonces (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(100) NOT NULL,
    nonce VARCHAR(64) NOT NULL,
    action VARCHAR(50) NOT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    UNIQUE(wallet_address, action)
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet ON auth_nonces(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expiry ON auth_nonces(expires_at);

COMMENT ON TABLE auth_nonces IS 'Security nonces for authentication actions (login, register, etc) with replay protection.';


-- FILE: 20260124_create_token_audit_logs.sql
-- Migration: Create Comprehensive Token Audit Table
-- Purpose: Track all token operations (Mint, Burn, Buy) for transparency and compliance
-- Created: 2026-01-24

CREATE TABLE IF NOT EXISTS token_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    wallet_address VARCHAR(42) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'NTK_MINT', 'NTKR_MINT', 'NTKR_BURN', 'PACKAGE_BUY', 'DOC_ACTION_BURN'
    amount DECIMAL(36, 18),
    tx_hash VARCHAR(66),
    relayer_address VARCHAR(42),
    status VARCHAR(20) NOT NULL, -- 'SUCCESS', 'FAILED'
    metadata JSONB, -- Additional data like packageId, category, etc.
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_audit_user ON token_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_wallet ON token_audit_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_token_audit_action ON token_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_token_audit_created ON token_audit_logs(created_at);

COMMENT ON TABLE token_audit_logs IS 'Unified audit trail for all token-related operations across NTK and NTKR ecosystems.';


-- FILE: 20260124_fix_notary_apps_status.sql
-- Migration: Update notary_applications status constraint
-- Purpose: Allow 'APPLIED' and 'KYC_VERIFIED' states used in the backend
-- Created: 2026-01-24

ALTER TABLE notary_applications DROP CONSTRAINT IF EXISTS notary_applications_status_check;

ALTER TABLE notary_applications 
ADD CONSTRAINT notary_applications_status_check 
CHECK (status IN ('pending', 'APPLIED', 'KYC_VERIFIED', 'approved', 'rejected', 'activated'));

-- Ensure current rows are valid (though they should be)
UPDATE notary_applications SET status = 'APPLIED' WHERE status = 'pending';


-- FILE: 20260125_add_device_id.sql
-- Add Hardware Binding column
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_device_id VARCHAR(255);


-- FILE: 20260125_fix_timestamps.sql
-- Fix timezone issue
ALTER TABLE auth_nonces 
ALTER COLUMN issued_at TYPE TIMESTAMPTZ,
ALTER COLUMN expires_at TYPE TIMESTAMPTZ;


-- FILE: 20260205000001_rename_kyc_status_to_liveness_status.sql
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_status') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'liveness_status') THEN
            ALTER TABLE users RENAME COLUMN kyc_status TO liveness_status;
        ELSE
            -- Both exist, drop the old one as it's redundant
            ALTER TABLE users DROP COLUMN kyc_status;
        END IF;
    END IF;
END $$;

-- Update any existing data if needed (optional, depends on current values)
-- The default 'pending' value should remain the same


-- FILE: 20260205_remote_auth.sql
-- Migration: Create remote_auth_sessions table
-- Description: Supports "Login via Browser" for the Desktop App

CREATE TABLE IF NOT EXISTS remote_auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'expired', 'failed')),
    wallet_address VARCHAR(42),
    token TEXT,
    device_id TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authorized_at TIMESTAMP WITH TIME ZONE
);

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_remote_auth_expires ON remote_auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_remote_auth_status ON remote_auth_sessions(status);


-- FILE: 20260211000001_fix_is_deleted_column.sql
-- Migration to fix is_deleted column mismatch and file_hash length
DO $$ 
BEGIN
    -- 1. Rename deleted_flag to is_deleted if it exists and is_deleted doesn't
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'deleted_flag') 
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'is_deleted') THEN
        ALTER TABLE documents RENAME COLUMN deleted_flag TO is_deleted;
    END IF;

    -- 2. Add is_deleted if neither exists (safety)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'is_deleted') THEN
        ALTER TABLE documents ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
    END IF;

    -- 3. Fix file_hash length (needs 66 characters for 0x + 64 hex SHA256)
    ALTER TABLE documents ALTER COLUMN file_hash TYPE VARCHAR(100);
END $$;


-- FILE: 20260211000002_update_proposal_types.sql
-- Migration to update proposal_type ENUM
ALTER TYPE proposal_type ADD VALUE IF NOT EXISTS 'add_admin';
ALTER TYPE proposal_type ADD VALUE IF NOT EXISTS 'remove_admin';


-- FILE: 20260211100003_add_summary_fingerprint.sql
-- Migration to add summary_fingerprint column for tamper-proof records
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'summary_fingerprint') THEN
        ALTER TABLE documents ADD COLUMN summary_fingerprint VARCHAR(255);
    END IF;
END $$;


-- FILE: 20260211_add_document_metadata.sql
-- Add metadata columns for notary approval/rejection details
-- Created: 2026-02-11

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS notary_notes TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS document_summary TEXT;

-- Add comments for documentation
COMMENT ON COLUMN documents.notary_notes IS 'Notes and document summary provided by notary during approval';
COMMENT ON COLUMN documents.rejection_reason IS 'Reason provided by notary when rejecting a document';
COMMENT ON COLUMN documents.document_summary IS 'Summary of important document contents filled by notary';


-- FILE: 20260211_fix_ntk_amount_overflow.sql
-- Fix numeric overflow in ntk_mint_audit.amount column
-- Change from DECIMAL(20, 18) to DECIMAL(30, 18) to allow values up to 999999999999.999...

ALTER TABLE ntk_mint_audit 
ALTER COLUMN amount TYPE DECIMAL(30, 18);

-- Update default value
ALTER TABLE ntk_mint_audit 
ALTER COLUMN amount SET DEFAULT 100;


-- FILE: 20260219_create_token_deposits.sql
-- Token Deposits: Bridge between on-chain NTKR purchases and internal DB balance
-- Each row is a verified on-chain PackagePurchased event that has been credited to the user

CREATE TABLE IF NOT EXISTS token_deposits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    tx_hash VARCHAR(128) NOT NULL UNIQUE,
    block_number INTEGER NOT NULL,
    package_id INTEGER NOT NULL,
    ntkr_amount NUMERIC(20,4) NOT NULL CHECK (ntkr_amount > 0),
    wallet_address VARCHAR(64) NOT NULL,
    verified_at TIMESTAMP DEFAULT NOW()
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_token_deposits_user_id ON token_deposits(user_id);
-- Index for tx_hash lookups (UNIQUE already creates one, but explicit for clarity)


-- FILE: 20260223_add_proposal_targeting.sql
-- Migration to add targeting to governance proposals
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS target_notaries JSONB DEFAULT '[]';


-- FILE: 20260223_extend_transaction_enum.sql
-- Migration: 20260223_extend_transaction_enum.sql
-- Goal: Support the new transactional lifecycle statuses for NTKR transactions.

ALTER TYPE transaction_status_enum ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE transaction_status_enum ADD VALUE IF NOT EXISTS 'skipped';


-- FILE: 20260223_remote_gov_sessions.sql
-- Migration: Create remote_gov_sessions table
-- Description: Supports remote governance voting from the desktop app

CREATE TABLE IF NOT EXISTS remote_gov_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id INTEGER REFERENCES governance_proposals(id),
    decision TEXT NOT NULL,
    challenge TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'expired', 'failed')),
    wallet_address VARCHAR(42),
    signature TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authorized_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_remote_gov_expires ON remote_gov_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_remote_gov_status ON remote_gov_sessions(status);


-- FILE: 20260319_reputation_system.sql
-- ====================================================
-- Phase 4: Reputation System Database Migration
-- ====================================================

-- 1. Add reputation columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS raw_reputation FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_reputation FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT NOW();

-- Index on effective_reputation for fast weighted queries
CREATE INDEX IF NOT EXISTS idx_users_effective_rep ON users(effective_reputation DESC);

-- ====================================================
-- 2. reputation_events table
-- Immutable audit log of every score-affecting event.
-- ====================================================
CREATE TABLE IF NOT EXISTS reputation_events (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('APPROVE', 'REJECT', 'DISPUTE', 'GOVERNANCE')),
    score_delta FLOAT NOT NULL,
    document_id INT REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for per-user history queries (used by worker)
CREATE INDEX IF NOT EXISTS idx_reputation_events_user_id ON reputation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_doc_event ON reputation_events(document_id, event_type);

-- ====================================================
-- 3. disputes table
-- Tracks owner-submitted disputes and admin resolution.
-- ====================================================
CREATE TABLE IF NOT EXISTS disputes (
    id SERIAL PRIMARY KEY,
    document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    submitted_by INT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolved_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for admin dispute queue
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_document_id ON disputes(document_id);

-- ====================================================
-- 4. Add 'assigned' to documents.submission_state
-- ====================================================
-- submission_state is VARCHAR so no enum change needed.
-- The value 'assigned' is now valid alongside: pending, submitted_to_blockchain, rejected, failed


-- FILE: 20260319_wallet_normalization.sql
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


-- FILE: 20260320_upload_intents.sql
-- ================================================================
-- Migration: 20260320_upload_intents.sql
-- Blockchain-first NTKR payment — upload intent system
-- ================================================================

-- 1. Upload intents: hold temp file + pending payment state
CREATE TABLE IF NOT EXISTS upload_intents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  file_hash     TEXT NOT NULL,
  filename      TEXT NOT NULL,
  filepath      TEXT NOT NULL,       -- temp file on disk, cleaned on expiry
  category      INTEGER NOT NULL DEFAULT 0,
  amount        NUMERIC NOT NULL,    -- NTKR cost in whole tokens (e.g. 1 or 5)
  amount_wei    TEXT NOT NULL,       -- full 18-decimal string for on-chain exact match
  status        TEXT NOT NULL DEFAULT 'awaiting_payment'
                  CHECK (status IN ('awaiting_payment','completed','expired','failed')),
  payment_tx_hash TEXT UNIQUE,       -- set on confirm; UNIQUE prevents replay
  created_at    TIMESTAMP DEFAULT NOW(),
  expires_at    TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

CREATE INDEX IF NOT EXISTS idx_upload_intents_user
  ON upload_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_intents_status
  ON upload_intents(status);
CREATE INDEX IF NOT EXISTS idx_upload_intents_expires
  ON upload_intents(expires_at) WHERE status = 'awaiting_payment';
CREATE INDEX IF NOT EXISTS idx_upload_intents_hash
  ON upload_intents(file_hash);

-- 2. Link documents to their on-chain payment proof
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS payment_tx_hash TEXT UNIQUE;


-- FILE: 20260324_rename_filepath_to_storage_key.sql
-- ================================================================
-- Migration: 20260324_rename_filepath_to_storage_key.sql
-- Goal: Reflect cloud storage semantics by renaming filepath to storage_key
-- ================================================================

-- 1. Rename column and add state in upload_intents
ALTER TABLE upload_intents 
  RENAME COLUMN filepath TO storage_key;
ALTER TABLE upload_intents
  ADD COLUMN IF NOT EXISTS storage_state TEXT DEFAULT 'UPLOADED'
  CHECK (storage_state IN ('UPLOADED', 'STORED', 'NOTARIZED', 'DELETED'));

-- 2. Rename column and add state in documents
ALTER TABLE documents 
  RENAME COLUMN filepath TO storage_key;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_state TEXT DEFAULT 'STORED'
  CHECK (storage_state IN ('UPLOADED', 'STORED', 'NOTARIZED', 'DELETED'));


-- FILE: 20260324_task_consistency_v3.sql
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


-- FILE: 20260328_cleanup_identity_schema.sql
-- Unified Identity Schema Cleanup (STRICT MODEL v5 - Final Hardened)
-- Model: identity_lifecycle (REBUILT ENUM) | is_human_verified (Strict Boolean)
-- Protection: trg_enforce_identity_lifecycle (FSM Enforcement + Mandatory MetaAudit)

BEGIN;

-- 1. ACCESS EXCLUSIVE LOCK
LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

-- 2. Backup users table
CREATE TABLE IF NOT EXISTS users_backup_phase3_final AS SELECT * FROM users;

-- 3. Create NEW ENUM
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'identity_lifecycle') THEN
        CREATE TYPE identity_lifecycle AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ONCHAIN_PENDING', 'FAILED_SYNC');
    END IF;
END $$;

-- 4. Prepare Human Verification Column (Derived ONLY from liveness_status)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_human_verified BOOLEAN;

-- MAP ONLY LIVENESS
UPDATE users SET is_human_verified = (liveness_status IN ('verified', 'pass', 'verified_biometric'))
WHERE liveness_status IS NOT NULL;

UPDATE users SET is_human_verified = false WHERE is_human_verified IS NULL;

ALTER TABLE users ALTER COLUMN is_human_verified SET NOT NULL;
ALTER TABLE users ALTER COLUMN is_human_verified SET DEFAULT false;

-- 5. Migrate Lifecycle State
ALTER TABLE users ADD COLUMN new_identity_state identity_lifecycle DEFAULT 'PENDING';

UPDATE users SET new_identity_state = 'ACTIVE' WHERE identity_state = 'ACTIVE';
UPDATE users SET new_identity_state = 'ONCHAIN_PENDING' WHERE identity_state = 'ONCHAIN_PENDING';
UPDATE users SET new_identity_state = 'FAILED_SYNC' WHERE identity_state = 'FAILED_SYNC';
UPDATE users SET new_identity_state = 'PENDING' WHERE identity_state IN ('PENDING', 'PENDING_KYC', 'KYC_VERIFIED') OR identity_state IS NULL;

-- 6. Audit Trail Table
CREATE TABLE IF NOT EXISTS user_state_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    from_state identity_lifecycle,
    to_state identity_lifecycle,
    reason TEXT,
    changed_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_state_history_user_id ON user_state_history(user_id);

-- 7. Mandatory Transition Enforcement & MetaAudit Function
CREATE OR REPLACE FUNCTION fn_identity_lifecycle_steward() 
RETURNS TRIGGER AS $$
DECLARE
    app_reason TEXT;
    app_user_id INTEGER;
BEGIN
    -- Handle Initialization (Skip FSM for initial column move)
    IF OLD.new_identity_state IS NULL THEN
        RETURN NEW;
    END IF;

    -- Extract MUST EXIST Session Metadata (MANDATORY)
    BEGIN
        app_user_id := current_setting('app.user_id')::INTEGER;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Audit Violation: app.user_id is missing from session context';
    END;

    BEGIN
        app_reason := current_setting('app.reason');
    EXCEPTION WHEN others THEN
        app_reason := 'Identitiy Lifecycle Transition';
    END;

    -- Validation: Active states require human verification
    IF NEW.new_identity_state IN ('ACTIVE', 'ONCHAIN_PENDING') AND NEW.is_human_verified = false THEN
        RAISE EXCEPTION 'Identity Lock: Human verification required for state %', NEW.new_identity_state;
    END IF;

    -- Ignore if no change
    IF OLD.new_identity_state IS NOT DISTINCT FROM NEW.new_identity_state THEN
        RETURN NEW;
    END IF;

    -- Strict FSM Enforcement
    IF NOT (
        (OLD.new_identity_state = 'PENDING' AND NEW.new_identity_state IN ('ACTIVE', 'REJECTED', 'ONCHAIN_PENDING')) OR
        (OLD.new_identity_state = 'ONCHAIN_PENDING' AND NEW.new_identity_state IN ('ACTIVE', 'FAILED_SYNC')) OR
        (OLD.new_identity_state = 'FAILED_SYNC' AND NEW.new_identity_state IN ('ONCHAIN_PENDING', 'REJECTED')) OR
        (OLD.new_identity_state = 'ACTIVE' AND NEW.new_identity_state = 'SUSPENDED') OR
        (OLD.new_identity_state = 'SUSPENDED' AND NEW.new_identity_state = 'ACTIVE') OR
        (OLD.new_identity_state = 'REJECTED' AND NEW.new_identity_state = 'PENDING')
    ) THEN
        RAISE EXCEPTION 'FSM Violation: Invalid transition from % to %', OLD.new_identity_state, NEW.new_identity_state;
    END IF;

    -- Mandatory Audit Logging
    INSERT INTO user_state_history (user_id, from_state, to_state, reason, changed_by)
    VALUES (NEW.id, OLD.new_identity_state, NEW.new_identity_state, app_reason, app_user_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_identity_lifecycle ON users;
CREATE TRIGGER trg_enforce_identity_lifecycle 
BEFORE UPDATE OF new_identity_state ON users
FOR EACH ROW EXECUTE FUNCTION fn_identity_lifecycle_steward();

-- 8. Migration Metadata (Allow migration to proceed by setting session vars)
SET LOCAL app.user_id = 0; 
SET LOCAL app.reason = 'Initial Phase 3 Migration';

-- 9. Swap Columns & Re-apply Final Constraints
ALTER TABLE users DROP COLUMN IF EXISTS identity_state;
ALTER TABLE users RENAME COLUMN new_identity_state TO identity_state;

-- Final constraint check on the renamed column
ALTER TABLE users ADD CONSTRAINT active_requires_human_verification 
CHECK (identity_state NOT IN ('ACTIVE', 'ONCHAIN_PENDING') OR is_human_verified = true);

-- 10. Purge Legacy
ALTER TABLE users DROP COLUMN IF EXISTS kyc_verified;
ALTER TABLE users DROP COLUMN IF EXISTS liveness_status;
ALTER TABLE users DROP COLUMN IF EXISTS kyc_status;

COMMIT;


-- MANUALLY ADDED: system_config
CREATE TABLE IF NOT EXISTS system_config (
    id serial PRIMARY KEY,
    version integer NOT NULL DEFAULT 1,
    config_snapshot jsonb NOT NULL,
    updated_at timestamp NOT NULL DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS system_config_history (
    id serial PRIMARY KEY,
    version integer NOT NULL,
    config_snapshot jsonb NOT NULL,
    updated_by integer REFERENCES users(id) ON DELETE SET NULL,
    timestamp timestamp NOT NULL DEFAULT current_timestamp,
    change_reason text
);

INSERT INTO system_config (id, version, config_snapshot) VALUES (1, 0, '{}') ON CONFLICT DO NOTHING;

