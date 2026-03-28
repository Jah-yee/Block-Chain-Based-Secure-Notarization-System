const configService = require('./src/services/config.service');
const pool = require('./src/db/index');
const crypto = require('crypto');

// 🛡️ [MOCK_ORCHESTRATOR] Bypassing DB to test SSoT Enrichment Logic
const mockSnapshot = {
  rpcUrl: "http://mock-bsc-testnet.com:8545",
  chainId: 97,
  contracts: {
    notaryRegistry: "0x1111111111111111111111111111111111111111",
    documentRegistry: "0x2222222222222222222222222222222222222222",
    ntkr: "0x3333333333333333333333333333333333333333",
    ntk: "0x4444444444444444444444444444444444444444"
  }
};

async function testEnrichment() {
  console.log('🛡️  Testing ConfigService SSoT Enrichment (MOCKED)...');
  
  // 1. Force Mock on DB Pool
  pool.query = async (sql) => {
    if (sql.includes('SELECT config_snapshot')) {
      return {
        rows: [{
          config_snapshot: mockSnapshot,
          version: 5,
          updated_at: new Date().toISOString()
        }]
      };
    }
  };

  try {
    const config = await configService.getConfig();
    
    console.log('✅ Mocked Response:');
    console.log(JSON.stringify(config, null, 2));

    const hasVersion = config.version === 5;
    const hasChecksum = typeof config.checksum === 'string' && config.checksum.length === 64;
    const hasTimestamp = !!config.updatedAt;

    if (hasVersion && hasChecksum && hasTimestamp) {
      console.log('🏆 SUCCESS: ConfigService properly enriches snapshots with version and HMAC checksum.');
    } else {
      console.error('❌ FAIL: Missing or incorrect enrichment fields.');
      console.log(`Version: ${config.version}, Checksum: ${!!config.checksum}, Timestamp: ${!!config.updatedAt}`);
    }
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
  } finally {
    process.exit();
  }
}

testEnrichment();
