-- BBSNS Master Schema Synchronization
-- Target: Zero-Error Production State

-- 1. Wallet Nonces Resolution
ALTER TABLE wallet_nonces ADD COLUMN IF NOT EXISTS purpose VARCHAR(50) DEFAULT 'LOGIN';

-- 2. User Table Stabilization
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE; -- Safety re-run
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- 3. Verification Audit
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_name IN ('wallet_nonces', 'users') 
AND column_name IN ('purpose', 'is_banned', 'is_active');
