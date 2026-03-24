const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

const sql = `
-- 🛡️ [GUARDIAN] Direct Table Creation
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    config_snapshot JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_config_history (
    id SERIAL PRIMARY KEY,
    version INTEGER NOT NULL,
    config_snapshot JSONB NOT NULL,
    updated_by INTEGER REFERENCES users(id),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_reason TEXT
);

-- Initialize active config with empty state
INSERT INTO system_config (id, version, config_snapshot) 
VALUES (1, 0, '{}') 
ON CONFLICT (id) DO NOTHING;

-- Initialize pg_migrations to prevent future conflicts
CREATE TABLE IF NOT EXISTS pg_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    run_on TIMESTAMP NOT NULL
);

INSERT INTO pg_migrations (name, run_on) 
VALUES ('20260323_system_config_governance', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
`;

async function apply() {
  console.log('🛡️ [GUARDIAN] Injecting Configuration Tables & Migration Records...');
  try {
    await pool.query(sql);
    console.log('✅ [GUARDIAN] Configuration Layer Established.');
  } catch (err) {
    console.error('❌ [GUARDIAN] Injection Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

apply();
