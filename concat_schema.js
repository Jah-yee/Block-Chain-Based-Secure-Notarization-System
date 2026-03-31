const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql') && !f.includes('rollback')).sort();
let schema = `-- RESET PASSWORD AND INITIALIZE\nALTER USER postgres PASSWORD 'postgres';\n\n`;
files.forEach(f => {
    console.log(`Adding ${f}...`);
    schema += `-- FILE: ${f}\n` + fs.readFileSync(path.join(dir, f), 'utf8') + '\n\n';
});

// Manually add system_config from JS migration
schema += `-- MANUALLY ADDED: system_config\n`;
schema += `CREATE TABLE IF NOT EXISTS system_config (
    id serial PRIMARY KEY,
    version integer NOT NULL DEFAULT 1,
    config_snapshot jsonb NOT NULL,
    updated_at timestamp NOT NULL DEFAULT current_timestamp
);\n\n`;
schema += `CREATE TABLE IF NOT EXISTS system_config_history (
    id serial PRIMARY KEY,
    version integer NOT NULL,
    config_snapshot jsonb NOT NULL,
    updated_by integer REFERENCES users(id) ON DELETE SET NULL,
    timestamp timestamp NOT NULL DEFAULT current_timestamp,
    change_reason text
);\n\n`;
schema += `INSERT INTO system_config (id, version, config_snapshot) VALUES (1, 0, '{}') ON CONFLICT DO NOTHING;\n\n`;

fs.writeFileSync('c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/final_schema.sql', schema);
console.log('Final schema concatenated effectively.');
