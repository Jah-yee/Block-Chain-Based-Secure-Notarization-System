const fs = require('fs');
const path = require('path');
const pool = require('../src/db/index');

async function bootstrap() {
    console.log('🚀 [BOOTSTRAP] Starting Database Schema Sync (Atomic Bloc)...');
    const client = await pool.connect();

    try {
        const migrationsDir = path.join(__dirname, '../migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
            .sort((a, b) => {
                const aDate = a.split('_')[0];
                const bDate = b.split('_')[0];
                if (aDate === bDate) {
                    // Prioritize table creation within the same day
                    if (a.includes('create_') && !b.includes('create_')) return -1;
                    if (!a.includes('create_') && b.includes('create_')) return 1;
                }
                return a.localeCompare(b);
            });

        await client.query('BEGIN');
        console.log('⚖️ [TRANS] Transaction started.');

        for (const file of files) {
            console.log(`📜 [SYNC] Processing: ${file}`);
            const filePath = path.join(migrationsDir, file);
            
            if (file.endsWith('.sql')) {
                const sql = fs.readFileSync(filePath, 'utf8');
                await client.query(sql);
                console.log(`✅ Applied SQL: ${file}`);
            } else if (file.endsWith('.js')) {
                const migration = require(filePath);
                if (migration.up) {
                    const pgmMock = {
                        createTable: async (name, cols) => {
                            const colDefs = Object.entries(cols).map(([name, def]) => {
                                if (name === 'id' && def.type === 'serial') return `${name} SERIAL PRIMARY KEY`;
                                let type = def.type === 'jsonb' ? 'JSONB' : 
                                           def.type === 'integer' ? 'INTEGER' : 
                                           def.type === 'timestamp' ? 'TIMESTAMP' : 'TEXT';
                                let constraints = [];
                                if (def.notNull) constraints.push('NOT NULL');
                                if (def.default !== undefined) {
                                    const devVal = typeof def.default === 'string' ? `'${def.default}'` : def.default;
                                    constraints.push(`DEFAULT ${def.default?.name ? 'CURRENT_TIMESTAMP' : devVal}`);
                                }
                                return `${name} ${type} ${constraints.join(' ')}`;
                            }).join(', ');
                            await client.query(`CREATE TABLE IF NOT EXISTS ${name} (${colDefs})`);
                        },
                        createIndex: async (table, cols) => {
                            const colNames = Array.isArray(cols) ? cols.join('_') : cols;
                            const colList = Array.isArray(cols) ? cols.join(', ') : cols;
                            await client.query(`CREATE INDEX IF NOT EXISTS idx_${table}_${colNames} ON ${table}(${colList})`);
                        },
                        addConstraint: async (table, name, check) => {
                            // Basic mock for check constraints
                            if (check && check.check) {
                                await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${check.check})`);
                            }
                        },
                        dropTable: async (name) => await client.query(`DROP TABLE IF EXISTS ${name}`),
                        sql: async (sql) => await client.query(sql),
                        func: (name) => ({ name })
                    };
                    await migration.up(pgmMock);
                    console.log(`✅ Applied JS: ${file}`);
                }
            }
        }

        await client.query('COMMIT');
        console.log('🎉 [DONE] Database Schema is synchronized atomically.');
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ [FATAL] Bootstrap Failed (Rolled Back):', err.message);
        process.exit(1);
    } finally {
        if (client) client.release();
        process.exit(0);
    }
}

bootstrap().catch(err => {
    console.error('❌ [FATAL] Bootstrap Failed:', err);
    process.exit(1);
});
