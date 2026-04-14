require('dotenv').config();
const { ethers } = require("ethers");
const DB = require("./src/db/index");
const Storage = require("./src/services/storage.service");
const dbContext = require('./src/db/context');
const ConfigService = require("./src/services/config.service");
const SecretService = require("./src/services/secret.service");

const PORT = parseInt(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

if (process.env.PORT && isNaN(PORT)) {
    console.error(`❌ CRITICAL: Invalid PORT defined: ${process.env.PORT}`);
    process.exit(1);
}

async function bootstrap() {
  console.log("🚀 Initializing BBSNS Zero-Trust Backend...");
  
  // 🔍 [AUDIT] Runtime Environment Snapshot
  console.log("🔍 [AUDIT] Pre-Secret Snapshot:");
  console.log(`   - NODE_ENV: [${process.env.NODE_ENV}]`);
  console.log(`   - CHAIN_ID: [${process.env.CHAIN_ID}]`);
  console.log(`   - JWT_SECRET: [${process.env.JWT_SECRET ? 'SET (AUDIT_FAIL)' : 'MISSING (EXPECTED)'}]`);

  // 0. 🛡️ Fetch Authoritative Secrets from AWS Vault (NON-ECHO)
  try {
    console.log("   - 🛡️ Initiating SecretService.loadSecrets()...");
    await SecretService.loadSecrets();
    console.log(`   - 🛡️ Post-Secret JWT_SECRET: [${process.env.JWT_SECRET ? 'SET (SUCCESS)' : 'MISSING (FATAL)'}]`);
  } catch (secretErr) {
    console.error("❌ CRITICAL: SecretService Boot Failure. Application is unconfigured.");
    console.error(`   - Error: ${secretErr.message}`);
    process.exit(1);
  }

  // 1. 🐘 Initialize Database Pool (PHASE 2 - HARDENED)
  try {
    DB.init();
    console.log("   ✅ Database Pool initialized with vaulted credentials.");
  } catch (dbErr) {
    console.error("❌ CRITICAL: Database initialization failure:", dbErr.message);
    process.exit(1);
  }

  // 2. 📦 Initialize Storage Service (PHASE 3 - HARDENED)
  try {
    Storage.init();
    console.log("   ✅ Storage Service initialized for cloud operations.");
  } catch (storageErr) {
    console.error("❌ CRITICAL: Storage initialization failure:", storageErr.message);
    process.exit(1);
  }

  // 3. Startup Guard & Authoritative Config Handshake (SSoT)
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

  // 4. 🚀 Load Application & Routes (PHASE 4 - LATE BINDING)
  // We require 'app' ONLY HERE so all nested captures (JWT_SECRET, etc.) have access to the vault.
  const app = require("./src/app");

  const { BBSNS_DOMAINS } = require("./src/constants/protocol");

  // 2. Structural Route Audit (Phase 4: Capability Graph Enforcement)
  const unprotectedRoutes = [];
  const auditRoutes = (stack, path = '') => {
    if (!stack || !Array.isArray(stack)) return;
    for (const layer of stack) {
      if (!layer) continue;
      if (layer.route) {
        let routePath = (path + layer.route.path).replace(/\/+/g, '/');
        if (!routePath.startsWith('/')) routePath = '/' + routePath;
        
        // 🛡️ [PHASE FINAL] Mandatory Auth Bootstrap Bypass
        if (routePath.startsWith('/api/auth/') || routePath.startsWith('/auth/') || 
            ['/nonce', '/login', '/pre-check', '/genesis/onboard', '/notary/onboard'].includes(routePath)) {
            continue; // Authorize bootstrapping entry point
        }
        
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
        const middlewares = layer.route.stack.map((s, index) => ({ 
          name: s.name || 'anonymous',
          index,
          domain: s.handle?.__domain,
          action: s.handle?.__action,
          isMutation: s.handle?.__isMutation,
          isActor: (s.name === 'requirePrivilege' || s.name === 'withGuestContext' || s.name === 'allowPublic')
        }));

        const domainNode = middlewares.find(m => m.domain);
        const actionNode = middlewares.find(m => m.action);
        const mutationNode = middlewares.find(m => m.isMutation);
        const actorNode = middlewares.find(m => m.isActor);

        // 🛡️ [PHASE 4] EXPLICIT MUTATION INTENT RULE
        if (mutationNode) {
          // A. Structural Existence Check
          if (!domainNode || !actionNode || !actorNode) {
            const missing = [!domainNode && 'Domain', !actorNode && 'Actor', !actionNode && 'Action'].filter(Boolean);
            unprotectedRoutes.push(`[STRUCTURAL_MISSING] ${methods.join(',')} ${routePath} - Missing: ${missing.join(', ')}`);
          } else {
            // B. Domain-Action Binding Check
            const prefix = BBSNS_DOMAINS[domainNode.domain];
            if (!actionNode.action.startsWith(prefix)) {
              unprotectedRoutes.push(`[ACTION_DOMAIN_MISMATCH] ${methods.join(',')} ${routePath} - Action ${actionNode.action} vs Domain ${domainNode.domain}`);
            }

            // C. Chain of Command (Order Check)
            // Sequence: Domain -> Actor -> Action (Mutation can be anywhere after Domain)
            if (!(domainNode.index < actorNode.index && actorNode.index < actionNode.index)) {
              unprotectedRoutes.push(`[ORDER_VIOLATION] ${methods.join(',')} ${routePath} - Expected Domain -> Actor -> Action`);
            }
          }
        } else {
          // D. Undeclared Mutation Risk Check (POST without withMutation)
          if (methods.includes('POST') || methods.includes('PUT') || methods.includes('DELETE')) {
            console.warn(`⚠️ [UNDECLARED_MUTATION_RISK] ${methods.join(',')} ${routePath} - State-changing method used without explicit withMutation()`);
          }

          // E. [PHASE 4] READ-ONLY AUDIT (Action Allowed for SELECTs)
          // No restriction here anymore, just logging that it's a passive audit path.
        }

        const isBootstrappingPath = routePath.includes('/remote/');
        const isGuestAuthorized = actorNode && actorNode.name === 'withGuestContext';

        if (isGuestAuthorized && !isBootstrappingPath) {
          unprotectedRoutes.push(`[GUEST_MISUSE] ${methods.join(',')} ${routePath}`);
        }

      } else if (layer.handle && (layer.handle.stack || (layer.handle.router && layer.handle.router.stack))) {
        // Recurse into sub-routers or handlers with stacks
        const nextStack = layer.handle.stack || layer.handle.router.stack;
        let segment = '';
        
        if (layer.regexp && layer.regexp.source && layer.regexp.source !== '^\\/?(?=\\/|$)' && layer.regexp.source !== '^\\/?$') {
          segment = layer.regexp.source
            .replace('\\/?(?=\\/|$)', '')
            .replace(/\\\//g, '/')
            .replace('(?:/(?=$))?$', '')
            .replace(/^\^/, '')
            .replace(/\?$/, '')
            .replace(/\/\?$/, '')
            .split('(?=')[0]; // Strip lookaheads
        }
        
        const nextPath = (path + '/' + segment).replace(/\/+/g, '/');
        // console.log(`[AUDIT_TRACE] Router Found. Segment: ${segment} | Accumulated: ${nextPath}`);
        auditRoutes(nextStack, nextPath);
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

    // [PHASE 7.2] Authoritative Background Authority Launch
    // Responsibility: HANDLED BY DEDICATED PM2 WORKER PROCESSES.
    // Rule: We disable internal workers here to prevent race conditions and fulfill 
    // the Zero-Trust Isolation Guard (only isolated workers can elevate to SYSTEM context).
    console.log(`   - Web Authority launched in ISOLATION mode (RUNTIME='${process.env.BBSNS_RUNTIME || 'web'}')`);
    console.log(`   - Internal workers are DISABLED. Background Sync is handled by dedicated processes.`);

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
  dbContext.run({
    actor: 'SYSTEM',
    actorId: 'SYSTEM_BOOT',
    domain: 'SYSTEM',
    action: 'SYSTEM_BOOTSTRAP',
    requestId: `BOOT_${Date.now()}`,
    service: 'STARTUP_GUARD'
  }, () => {
    bootstrap();
  });
}
