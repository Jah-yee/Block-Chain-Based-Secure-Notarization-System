const pool = require('./src/db/index');

async function checkSchema() {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type, character_maximum_length, numeric_precision
            FROM information_schema.columns 
            WHERE table_name = 'ntk_mint_audit' 
            ORDER BY ordinal_position
        `);

        console.log('ntk_mint_audit schema:');
        console.log(JSON.stringify(result.rows, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSchema();
