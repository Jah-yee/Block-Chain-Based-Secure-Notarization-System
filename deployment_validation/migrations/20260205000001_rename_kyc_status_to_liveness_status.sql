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
