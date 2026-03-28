const configService = require('./src/services/config.service');

async function verify() {
  try {
    console.log('🛡️  Requesting Authoritative Config from Service...');
    const config = await configService.getConfig();
    
    console.log('✅ Service Response:');
    console.log(JSON.stringify(config, null, 2));

    if (config.version !== undefined && config.checksum !== undefined) {
      console.log('🏆 SUCCESS: SSoT Service is PHASE 1 compliant.');
    } else {
      console.warn('⚠️ WARNING: Service is missing critical SSoT fields (version/checksum).');
    }
  } catch (err) {
    console.error('❌ Service Error:', err);
  } finally {
    process.exit();
  }
}

verify();
