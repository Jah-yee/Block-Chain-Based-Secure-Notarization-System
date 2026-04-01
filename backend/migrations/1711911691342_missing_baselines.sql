-- 20241004120042_missing_baselines.sql
-- Fixes missing column baseline that was previously manually patched
-- Added at index 006 for logical ordering before identity cleanup

ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_state VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100);
