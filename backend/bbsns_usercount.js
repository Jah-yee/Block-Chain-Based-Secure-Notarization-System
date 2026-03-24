const {Pool}=require('pg');
const p=new Pool({connectionString:'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'});
async function run() {
  const byRole = await p.query("SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY count DESC");
  const total = await p.query("SELECT COUNT(*) as total FROM users");
  const recent = await p.query("SELECT role, wallet_address, created_at FROM users ORDER BY created_at DESC LIMIT 10");
  console.log('=== USERS BY ROLE ===');
  byRole.rows.forEach(x => console.log(`  ${x.role}: ${x.count}`));
  console.log(`TOTAL: ${total.rows[0].total}`);
  console.log('\n=== MOST RECENT ACCOUNTS ===');
  recent.rows.forEach(x => console.log(`  [${x.role}] ${(x.wallet_address||'no-wallet').substring(0,20)} — ${x.created_at}`));
  await p.end();
}
run().catch(e=>{console.error(e.message);p.end();});
