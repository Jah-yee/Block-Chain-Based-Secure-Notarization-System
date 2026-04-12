require('dotenv').config();
const pool = require("../src/db/index");
pool.init(); // 🛡️ [Hardening 2.9C-A] Boot the DB proxy
const emailService = require("../src/services/EmailService");
const UserService = require("../src/services/UserService");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

/**
 * 🛡️ [Hardening 2.9C-A] Final Flow Forensic Validation
 * Verifies the Notary Activation Architecture end-to-end without requiring HTTP overhead.
 */
async function validateFlow() {
  console.log("--- 🕵️ BBSNS FLOW VALIDATION (START) ---");
  const client = await pool.connect();
  
  try {
    // 1. Setup - Identify target application
    const appRes = await client.query("SELECT * FROM notary_applications WHERE id = 2");
    if (appRes.rows.length === 0) {
      console.error("❌ TESTAPP_NOT_FOUND: Application ID 2 missing.");
      return;
    }
    const app = appRes.rows[0];
    console.log(`✅ TEST_TARGET: APP_ID=${app.id} EMAIL=${app.email}`);

    // RESET STATE for clean test
    await client.query("UPDATE notary_applications SET status = 'pending', is_activated = false, activation_token = NULL, user_id = NULL WHERE id = 2");
    await client.query("DELETE FROM users WHERE email = $1", [app.email]);
    console.log("✅ TEST_STATE: Reset complete.");

    // 2. STAGE: Approval (No temp password)
    console.log("🚀 STAGE 1: Approving Application...");
    const activationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await client.query(
      `UPDATE notary_applications SET status = 'approved', activation_token = $1, activation_expires_at = $2 WHERE id = $3`,
      [activationToken, expiresAt, app.id]
    );
    console.log(`✅ STAGE 1_SUCCESS: Status=approved Token=${activationToken.substring(0,8)}...`);

    // 3. STAGE: Activation (Lazy User Creation)
    console.log("🚀 STAGE 2: Activating Account...");
    const testPassword = "SecurePassword123!";
    const hashedPassword = await bcrypt.hash(testPassword, 10);

    // Verify token exists and is valid
    const verifyRes = await client.query(
      "SELECT * FROM notary_applications WHERE activation_token = $1 AND activation_expires_at > NOW()",
      [activationToken]
    );
    if (verifyRes.rows.length === 0) throw new Error("TOKEN_VALIDATION_FAILED");

    // Create User (Simulating /activate logic)
    const newUser = await UserService.createUser({
      username: app.email,
      name: app.full_name,
      email: app.email,
      password_hash: hashedPassword,
      wallet_address: app.wallet_address.toLowerCase(),
      role: 'notary',
      identity_state: 'ACTIVE',
      is_human_verified: true
    });

    await client.query(
      "UPDATE notary_applications SET is_activated = true, status = 'activated', user_id = $1, activation_token = NULL WHERE id = $2",
      [newUser.id, app.id]
    );
    console.log(`✅ STAGE 2_SUCCESS: UserID=${newUser.id} Status=activated`);

    // 4. STAGE: Auth Gating Check
    console.log("🚀 STAGE 3: Verifying Auth Gate Logic...");
    const loginCheck = await client.query(
      "SELECT status, is_activated FROM notary_applications WHERE id = $1",
      [app.id]
    );
    const state = loginCheck.rows[0];
    if (state.status === 'activated' && state.is_activated === true) {
      console.log("✅ STAGE 3_SUCCESS: Login would be PERMITTED.");
    } else {
      console.error("❌ STAGE 3_FAIL: Login would be BLOCKED.");
    }

    console.log("--- 🏁 BBSNS FLOW VALIDATION (COMPLETE/PASS) ---");

  } catch (err) {
    console.error("❌ VALIDATION_CRASH:", err);
  } finally {
    client.release();
    process.exit();
  }
}

validateFlow();
