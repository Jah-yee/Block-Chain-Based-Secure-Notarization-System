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
