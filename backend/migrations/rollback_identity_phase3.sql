-- ROLLBACK: Phase 3 Identity Hardening
-- This script restores the system to the legacy identity state.

BEGIN;

-- 1. Remove FSM Triggers and Functions
DROP TRIGGER IF EXISTS trg_enforce_identity_lifecycle ON users;
DROP FUNCTION IF EXISTS fn_identity_lifecycle_steward();

-- 2. Remove History Tracking
DROP TABLE IF EXISTS user_state_history;

-- 3. Restore the 'users' table from backup
-- NOTE: We assume 'users_backup' was created immediately before migration
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename  = 'users_backup') THEN
        DROP TABLE IF EXISTS users CASCADE;
        ALTER TABLE users_backup RENAME TO users;
        
        -- Re-add critical indexes (base ones expected in legacy)
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_pkey') THEN
            ALTER TABLE users ADD PRIMARY KEY (id);
        END IF;
        
        -- Add unique constraints (wallet, email)
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_wallet_address_key;
        ALTER TABLE users ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);
        
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
        
        RAISE NOTICE 'Restored users table from users_backup.';
    ELSE
        RAISE EXCEPTION 'users_backup table not found. Cannot perform automated rollback.';
    END IF;
END $$;

-- 4. Remove New Enumerated Type
DROP TYPE IF EXISTS identity_lifecycle CASCADE;

COMMIT;
