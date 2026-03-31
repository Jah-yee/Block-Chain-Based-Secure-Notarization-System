const pool = require("../src/db/index");

async function checkEnums() {
    try {
        const result = await pool.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'proposal_type'");
        console.log("Proposal Types:", result.rows.map(r => r.enumlabel));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkEnums();
