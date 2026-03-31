-- BBSNS Production Schema Recovery v2
-- Target: Final 1.0 Stabilization

-- 1. Documents Table Alignment
ALTER TABLE documents ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chain_confirmed BOOLEAN DEFAULT FALSE;

-- 2. Users Table Alignment
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'identity_status') THEN
        CREATE TYPE identity_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
    END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_state identity_status DEFAULT 'PENDING';

-- 3. Verification Audit
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('documents', 'users') 
AND column_name IN ('retry_count', 'chain_confirmed', 'is_active', 'identity_state');
