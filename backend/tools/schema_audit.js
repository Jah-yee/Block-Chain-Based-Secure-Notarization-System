const { Client } = require('pg');
require('dotenv').config({ path: '../.env' });

async function auditSchema() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('🔍 BBSNS Database Schema Audit Started...');

        // 1. List Tables
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('\n--- TABLES ---');
        tablesRes.rows.forEach(r => console.log(`[TABLE] ${r.table_name}`));

        // 2. List Enums
        const enumsRes = await client.query(`
            SELECT t.typname as enum_name, 
                   e.enumlabel as enum_value
            FROM pg_type t 
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public'
        `);
        console.log('\n--- ENUMS ---');
        const enums = {};
        enumsRes.rows.forEach(r => {
            if (!enums[r.enum_name]) enums[r.enum_name] = [];
            enums[r.enum_name].push(r.enum_value);
        });
        Object.entries(enums).forEach(([name, vals]) => console.log(`[ENUM] ${name}: ${vals.join(', ')}`));

        // 3. List Columns + Types
        const columnsRes = await client.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        `);
        console.log('\n--- COLUMNS ---');
        columnsRes.rows.forEach(c => console.log(`[COLUMN] ${c.table_name}.${c.column_name} (${c.data_type}) | nullable: ${c.is_nullable}`));

        // 4. List Foreign Keys
        const fkRes = await client.query(`
            SELECT
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY';
        `);
        console.log('\n--- FOREIGN KEYS ---');
        fkRes.rows.forEach(fk => console.log(`[FK] ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`));

    } catch (err) {
        console.error('❌ Audit Failed:', err.message);
    } finally {
        await client.end();
    }
}

auditSchema();
