-- BBSNS Production Final Schema Stabilization
-- Target: 100% Recovery and Code Alignment

-- 1. Documents Table: Primary Behavioral Columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chain_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS submission_state VARCHAR(50) DEFAULT 'initiated';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP DEFAULT NOW();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 2. Users Table: Identity & Lifecycle Columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP DEFAULT NOW();

-- Handle Identity State Enum Safely
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'identity_status') THEN
        CREATE TYPE identity_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'ONCHAIN_PENDING');
    ELSE
        -- Ensure all required values are in the enum (Add missing items if needed)
        BEGIN
            ALTER TYPE identity_status ADD VALUE 'ACTIVE';
        EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN
            ALTER TYPE identity_status ADD VALUE 'ONCHAIN_PENDING';
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_state identity_status DEFAULT 'PENDING';

-- 3. Verification Audit
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('documents', 'users') 
ORDER BY table_name, column_name;
