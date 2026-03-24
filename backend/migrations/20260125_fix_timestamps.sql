-- Fix timezone issue
ALTER TABLE auth_nonces 
ALTER COLUMN issued_at TYPE TIMESTAMPTZ,
ALTER COLUMN expires_at TYPE TIMESTAMPTZ;
