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
