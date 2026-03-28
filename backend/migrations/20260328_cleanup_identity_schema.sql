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
