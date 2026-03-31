-- Add Hardware Binding column
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_device_id VARCHAR(255);
