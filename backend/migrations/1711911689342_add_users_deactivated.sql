-- migrations/004_add_users_deactivated.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;
