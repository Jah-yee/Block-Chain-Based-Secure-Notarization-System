const { execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const pool = require('../src/db/index');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function verify() {
  console.log('🌐 [FINAL_VERIFICATION] Starting Contract Reality Check (Database Context)...');
  
  const res = await pool.query('SELECT config_snapshot FROM system_config WHERE id = 1');
  if (res.rowCount === 0) {
    console.error('❌ [FAIL] No configuration found in database.');
    process.exit(1);
  }

  const config = res.rows[0].config_snapshot;
  console.log(`🔗 RPC: ${config.rpcUrl}`);
  console.log(`🆔 Chain ID: ${config.chainId}`);

  for (const [name, address] of Object.entries(config.contracts)) {
    if (!address || address.startsWith('0x0000')) {
        console.log(`⏭️  [SKIP] ${name} (${address}) - Missing or Placeholder.`);
        continue;
    }

    try {
      const curlCmd = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["${address}","latest"],"id":1}' "${config.rpcUrl}"`;
      const output = execSync(curlCmd).toString();
      const data = JSON.parse(output);
      
      const code = data.result;
      const exists = code && code !== '0x' && code !== '0x0';
      
      if (exists) {
        console.log(`✅ [PASS] ${name} (${address}): Bytecode detected (${code.length - 2} hex chars).`);
      } else {
        console.log(`🚨 [FAIL] ${name} (${address}): NO BYTECODE FOUND! (Code: ${code})`);
      }
    } catch (err) {
      console.error(`⚠️ [ERROR] ${name} failed:`, err.message);
    }
  }
  process.exit(0);
}

verify();
