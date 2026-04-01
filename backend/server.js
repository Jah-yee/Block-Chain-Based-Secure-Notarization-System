const app = require("./src/app");
const { ethers } = require("ethers");

// 🛡️ Global BigInt Serialization Policy
BigInt.prototype.toJSON = function() { return this.toString(); };
const ConfigService = require("./src/services/config.service");

const PORT = parseInt(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

if (process.env.PORT && isNaN(PORT)) {
    console.error(`❌ CRITICAL: Invalid PORT defined: ${process.env.PORT}`);
    process.exit(1);
}

async function bootstrap() {
  console.log("🚀 Initializing BBSNS Zero-Trust Backend...");

  // 1. Startup Guard & Authoritative Config Handshake (SSoT)
  const StartupGuard = require("./src/services/startup-guard.service");
  
  try {
    // 🛡️ Audit Environment Configuration Correctness
    await StartupGuard.verifyEnvironmentVars();

    // 🛡️ Audit Migration Integrity Before Network Operations
    await StartupGuard.verifyMigrationIntegrity();
    
    // 🛡️ Verify Blockchain Network Context (Chain ID Verification)
    await StartupGuard.verifyBlockchainContext();

    console.log("   ✅ StartupGuard Handshake Complete.");
  } catch (err) {
    console.error("❌ CRITICAL: StartupGuard Failure. Environment is compromised or misconfigured.");
    console.error(err.message);
    process.exit(1);
  }

  // 2. Structural Route Audit (Mandatory Privilege Verification)
  const unprotectedRoutes = [];
  const auditRoutes = (stack, path = '') => {
    if (!stack || !Array.isArray(stack)) return;
    for (const layer of stack) {
      if (!layer) continue;
      if (layer.route) {
        let routePath = (path + layer.route.path).replace(/\/+/g, '/');
        if (!routePath.startsWith('/')) routePath = '/' + routePath;
        const stackNames = layer.route.stack.map(s => s.name || 'anonymous');
        const hasSecurity = layer.route.stack && layer.route.stack.some(s => s && (s.name === 'requirePrivilege' || s.name === 'allowPublic'));
        if (!hasSecurity) {
          unprotectedRoutes.push(`${Object.keys(layer.route.methods).join(',').toUpperCase()} ${routePath} [Stack Size: ${layer.route.stack.length}, Names: ${stackNames.join(', ')}]`);
          console.warn(`      [AUDIT_FAIL] ${routePath} - Layer Name: ${layer.name}, Stack Size: ${layer.route.stack.length}, Names: ${stackNames.join(', ')}`);
        }
      } else if (layer.name === 'router' || layer.name === 'bound dispatch') {
        const nextStack = layer.handle ? layer.handle.stack : (layer.route ? layer.route.stack : null);
        let segment = '';
        if (layer.regexp && layer.regexp.source) {
          segment = layer.regexp.source
            .replace('\\/?(?=\\/|$)', '')
            .replace(/\\\//g, '/')
            .replace('(?:/(?=$))?$', '');
          if (segment.startsWith('^\\')) segment = segment.substring(2);
          if (segment.startsWith('^')) segment = segment.substring(1);
        }
        auditRoutes(nextStack, path + segment);
      }
    }
  };

  app.listen(PORT, HOST, () => {
    console.log(`\n✅ BBSNS Server fully operational on port ${PORT}`);
    console.log(`   - Mode: ZERO-TRUST AUTHORITY (Chain Derived)`);

    // Delayed Structural Route Audit (Mandatory Privilege Verification)
    setTimeout(() => {
      console.log("   - Auditing Route Security...");
      try {
        const router = app._router || app.router;
        if (router && router.stack) {
          auditRoutes(router.stack);
          if (unprotectedRoutes.length > 0) {
            console.error("❌ CRITICAL: Unprotected routes detected in zero-trust boundary:");
            unprotectedRoutes.forEach(r => console.error(`      - ${r}`));
            process.exit(1);
          }
          console.log(`   ✅ Structural Audit Complete. All routes double-guarded.`);
        } else {
          console.warn("   ⚠️ Warning: Router stack not available for audit.");
        }
      } catch (auditErr) {
        console.error("❌ CRITICAL: Route Audit Logic Error:", auditErr.message);
      }
    }, 1000);

    // 3. Start System Activation Poller
    const checkActivation = async () => {
      if (global.systemActivated) return;
      try {
        const config = await ConfigService.getConfig();
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const genesisContract = new ethers.Contract(config.contracts.genesisActivation, ["function activated() view returns (bool)"], provider);
        const activated = await genesisContract.activated();
        if (activated) {
          global.systemActivated = true;
          console.log("   ✅ System Activation Discovered: Genesis Complete.");
        }
      } catch (err) {
        // quiet fail, check again next interval
      }
    };
    setInterval(checkActivation, 15000);
    checkActivation();

    // 4. Start Background Reconciliation Worker
    try {
      const { reconcile } = require("./src/workers/reconciliation-worker");
      const RECONCILIATION_INTERVAL = process.env.RECONCILIATION_INTERVAL || 30000;
      console.log(`   - Launching Reconciliation Worker (Interval: ${RECONCILIATION_INTERVAL}ms)`);
      setInterval(reconcile, RECONCILIATION_INTERVAL);
      // Run once immediately
      reconcile();
    } catch (workerErr) {
      console.error("❌ Warning: Failed to launch Reconciliation Worker:", workerErr.message);
    }

    // 4b. Start Identity Sync Worker (Enforcement)
    try {
      const { startWorker } = require("./src/workers/identity-sync-worker");
      console.log(`   - Launching Identity Sync Worker (Guardian Enforcement Active)`);
      startWorker();
    } catch (workerErr) {
      console.error("❌ Warning: Failed to launch Identity Sync Worker:", workerErr.message);
    }

    // 4c. Start Intent Cleanup Worker
    try {
      const { runIntentCleanup } = require("./src/workers/intent-cleanup-worker");
      const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
      console.log(`   - Launching Intent Cleanup Worker (Interval: 5m)`);
      setInterval(runIntentCleanup, CLEANUP_INTERVAL);
      runIntentCleanup(); // Run once on startup
    } catch (workerErr) {
      console.error("❌ Warning: Failed to launch Intent Cleanup Worker:", workerErr.message);
    }

    // 4d. Start Hardened Scavenger Worker (Distributed Recovery)
    try {
      const { runScavenger } = require("./src/workers/scavenger-worker");
      const SCAVENGER_INTERVAL = 30000; // 30 seconds
      console.log(`   - Launching Scavenger Worker (Self-Healing Recovery Active)`);
      setInterval(runScavenger, SCAVENGER_INTERVAL);
      runScavenger();
    } catch (workerErr) {
      console.error("❌ Warning: Failed to launch Scavenger Worker:", workerErr.message);
    }

    // 4. Initialize Circuit Breaker Status
    try {
      const circuitBreaker = require("./src/blockchain/circuit-breaker-state");
      circuitBreaker.init();
    } catch (cbErr) {
      console.error("❌ Warning: Failed to initialize Circuit Breaker State:", cbErr.message);
    }
  });
}

if (require.main === module) {
  bootstrap();
}

module.exports = app;
