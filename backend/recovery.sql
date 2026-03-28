-- 1. Create identity_state ENUM if it doesn't exist
DO $$ BEGIN
    CREATE TYPE identity_state AS ENUM (
      'PENDING_KYC', 
      'KYC_VERIFIED', 
      'ONCHAIN_PENDING', 
      'ACTIVE', 
      'FAILED_SYNC'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add column to users safely
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS identity_state identity_state 
DEFAULT 'PENDING_KYC';

-- 3. Add column to documents safely
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS chain_confirmed BOOLEAN DEFAULT FALSE;

-- 4. Transition existing admins to ACTIVE
UPDATE users 
SET identity_state = 'ACTIVE' 
WHERE role IN ('admin', 'notary') AND identity_state != 'ACTIVE';
