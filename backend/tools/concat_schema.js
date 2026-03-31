const fs = require('fs');
const path = require('path');

async function concatSchema() {
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort((a, b) => {
            // Extract the timestamp prefix (e.g., 20260117 or 20241004120001)
            const prefixA = a.split('_')[0];
            const prefixB = b.split('_')[0];
            
            // If the dates/timestamps are different, sort numerically/alphabetically
            if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
            
            // If the dates are identical, prioritize 'create' over 'add' or 'update'
            const isCreateA = a.toLowerCase().includes('create_');
            const isCreateB = b.toLowerCase().includes('create_');
            
            if (isCreateA && !isCreateB) return -1;
            if (!isCreateA && isCreateB) return 1;
            
            return a.localeCompare(b);
        });

    console.log(`📂 Found ${files.length} SQL migrations.`);
    
    let masterSql = 'BEGIN;\n\n';
    
    files.forEach(file => {
        if (file === 'rollback_identity_phase3.sql') return; // Skip rollbacks
        console.log(`   + Appending ${file}`);
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        masterSql += `-- ### MIGRATION: ${file} ###\n`;
        masterSql += content + '\n\n';
    });
    
    masterSql += 'COMMIT;';
    
    fs.writeFileSync(path.join(__dirname, 'full_schema_test.sql'), masterSql);
    console.log('✅ Master migration script created: tools/full_schema_test.sql');
}

concatSchema();
