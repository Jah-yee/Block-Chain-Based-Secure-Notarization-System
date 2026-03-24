-- migrations/008_alter_file_hash_to_varchar.sql
ALTER TABLE documents ALTER COLUMN file_hash TYPE VARCHAR(64);
