const pool = require('./src/db/index.js');
const { ethers } = require('ethers');
const dotenv = require('dotenv');
dotenv.config();

const ABI = [
  "function getUserRole(address) view returns (uint8)",
  "function isBanned(address) view returns (bool)"
];

async function runAudit() {
  console.log("--- BBSNS SYSTEM GUARDIAN INTEGRITY AUDIT ---");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL);
  const registry = new ethers.Contract(process.env.NOTARY_REGISTRY_ADDRESS, ABI, provider);

  try {
    const users = await pool.query("SELECT id, username, email, wallet_address, role, kyc_verified, identity_state FROM users");
    console.log(`Auditing ${users.rows.length} users...\n`);

    for (const user of users.rows) {
      console.log(`Checking [${user.username}] (${user.wallet_address})...`);
      
      // 1. Wallet Binding Check
      if (!user.wallet_address) {
        console.error(`🔴 CRITICAL: User ${user.username} has no wallet binding.`);
      }

      // 2. KYC vs Wallet Check
      if (user.kyc_verified && !user.wallet_address) {
        console.error(`🔴 CRITICAL: KYC verified but no wallet linked for ${user.username}.`);
      }

      // 3. On-Chain Role Check
      try {
        const onChainRole = await registry.getUserRole(user.wallet_address);
        const onChainBanned = await registry.isBanned(user.wallet_address);
        
        const ROLE_MAP = { 0: 'NONE', 1: 'OWNER', 2: 'NOTARY', 3: 'ADMIN' };
        const dbRole = user.role;
        const dbState = user.identity_state;

        console.log(`   - DB Role: ${dbRole} | DB State: ${dbState}`);
        console.log(`   - Chain Role: ${ROLE_MAP[Number(onChainRole)]} (${onChainRole})`);
        console.log(`   - Banned: ${onChainBanned}`);

        // --- AUDIT V2: Identity Integrity Mapping ---
        const isChainValid = Number(onChainRole) > 0;
        const isDbActive = dbState === 'ACTIVE';

        if (isDbActive && !isChainValid) {
            console.error(`🔴 CRITICAL: IDENTITY FORGERY! DB is ACTIVE but Chain is 0 for ${user.username}.`);
        } else if (!isDbActive && isChainValid) {
            console.warn(`🟡 WARNING: DESYNC! DB is ${dbState} but Chain is ${onChainRole} for ${user.username}.`);
        } else if (isDbActive && isChainValid) {
            console.log(`🟢 VALID: Synchronized identity.`);
        }

        // Rule 5: Admins/Notaries MUST be on-chain
        if ((dbRole === 'admin' && Number(onChainRole) !== 3) || (dbRole === 'notary' && Number(onChainRole) !== 2)) {
            console.error(`🔴 CRITICAL: Role escalation/mismatch! DB claims ${dbRole}, Chain says ${onChainRole}.`);
        }

      } catch (chainErr) {
        console.error(`❌ RPC Error checking ${user.wallet_address}:`, chainErr.message);
      }
      console.log("-------------------------------------------");
    }

  } catch (err) {
    console.error("Audit failed:", err);
  } finally {
    process.exit(0);
  }
}

runAudit();
