-- Migration to add summary_fingerprint column for tamper-proof records
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'summary_fingerprint') THEN
        ALTER TABLE documents ADD COLUMN summary_fingerprint VARCHAR(255);
    END IF;
END $$;
