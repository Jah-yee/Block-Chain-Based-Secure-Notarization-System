-- Migration: 000_create_system_config.sql
-- Goal: Establish the Authoritative Configuration Snapshot (SSoT) 

CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    config_snapshot JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    checksum TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_config_history (
    id SERIAL PRIMARY KEY,
    config_snapshot JSONB NOT NULL,
    version INTEGER NOT NULL,
    checksum TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize with placeholder if needed, but the seeding script handles this
-- INSERT INTO system_config (id, config_snapshot, version) VALUES (1, '{}', 1) ON CONFLICT (id) DO NOTHING;
