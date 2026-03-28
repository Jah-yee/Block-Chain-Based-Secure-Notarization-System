const express = require("express");
const router = express.Router();
const pool = require("../db/index.js");
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic } = require("../../middleware/actor.js");
const bcrypt = require("bcrypt");
const { registerNotaryOnChain } = require("../blockchain/notary-registry");

// Apply actor loading middleware
// router.use(loadActor) deprecated for zero-trust compliance

// PUBLIC: Check application status
router.get("/applications/status/:id", allowPublic, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, status, email FROM notary_applications WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Application not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC: Submit initial notary application
router.post("/applications/public", allowPublic, async (req, res) => {
  const { fullName, email, password, walletAddress, phone, license, experience, nationalId, nationality } = req.body;

  try {
    // GUARD: Reject if wallet already registered as a document owner (separate accounts required)
    if (walletAddress) {
      const walletInUse = await pool.query(
        "SELECT id, role FROM users WHERE wallet_address = $1",
        [walletAddress.toLowerCase()]
      );
      if (walletInUse.rows.length > 0) {
        return res.status(409).json({
          error: "This wallet is already registered as a document owner. Notaries must use a separate wallet address."
        });
      }
    }

    // Check if wallet or email already has a pending/approved application
    const queryParts = ["email = $1"];
    const queryParams = [email.toLowerCase()];

    if (walletAddress) {
      queryParts.push("wallet_address = $2");
      queryParams.push(walletAddress.toLowerCase());
    }

    const existing = await pool.query(
      `SELECT * FROM notary_applications WHERE ${queryParts.join(" OR ")}`,
      queryParams
    );

    if (existing.rows.length > 0) {
      const app = existing.rows[0];
      if (app.status === 'approved') return res.status(400).json({ error: "Professional already registered." });

      // If pending, applied, or kyc_verified allow updating the non-identity fields instead of erroring
      if (['pending', 'APPLIED', 'KYC_VERIFIED'].includes(app.status)) {
        await pool.query(`
          UPDATE notary_applications 
          SET phone = $1, experience = $2, nationality = $3, national_id_number = $4, updated_at = NOW()
          WHERE id = $5
        `, [phone, experience, nationality, nationalId, app.id]);

        return res.status(200).json({
          message: "Application session synchronized. Resuming verification.",
          id: app.id,
          status: app.status,
          resumed: true
        });
      }

      return res.status(400).json({
        error: "Application already exists.",
        id: app.id,
        status: app.status
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const crypto = require('crypto');
    const nationalIdHash = nationalId ? crypto.createHash('sha256').update(String(nationalId)).digest('hex') : null;

    // user_id is NULL at submission — a new user account is created on approval
    const result = await pool.query(`
      INSERT INTO notary_applications 
      (full_name, email, password_hash, wallet_address, phone, license_number, experience, national_id_number, national_id_hash, nationality, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING id
    `, [fullName, email, passwordHash, walletAddress ? walletAddress.toLowerCase() : null, phone, license, experience, nationalId, nationalIdHash, nationality]);

    res.status(201).json({
      message: "Application recorded. Proceed to biometric verification.",
      id: result.rows[0].id
    });
  } catch (err) {
    console.error("Public App Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC: Finalize application with face descriptor & signature
router.post("/applications/:id/verify", allowPublic, async (req, res) => {
  const { id } = req.params;
    const { signature, faceDescriptor, walletAddress } = req.body;

  try {
    const { ethers } = require('ethers');
    const normalizedWallet = (walletAddress || "").toLowerCase();

    if (!normalizedWallet || !signature) {
      return res.status(400).json({ error: "walletAddress and signature are required" });
    }

    // 1. Fetch EXCLUSIVE valid nonce for NOTARY_BIND
    const nonceResult = await pool.query(
      `SELECT nonce FROM wallet_nonces 
       WHERE LOWER(wallet_address) = $1 AND purpose = 'NOTARY_BIND' 
       AND used_at IS NULL AND expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedWallet]
    );

    if (nonceResult.rows.length === 0) {
      return res.status(401).json({ error: "Missing or expired verification session. Please request a new nonce." });
    }

    // 2. Cryptographic Signature Verification
    const nonce = nonceResult.rows[0].nonce;
    const APP_NAME = 'BBSNS';
    const message = `Notary binding request for ${APP_NAME}: ${nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== normalizedWallet) {
      return res.status(401).json({ error: "Signature verification failed: Address mismatch" });
    }

    // 3. Mark Nonce Used
    await pool.query(
      "UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2",
      [normalizedWallet, nonce]
    );

    // 4. Update Application State
    const result = await pool.query(
      "UPDATE notary_applications SET face_descriptor = $1, wallet_nonce = $2, wallet_address = $3, status = 'APPLIED', updated_at = NOW() WHERE id = $4 RETURNING *",
      [JSON.stringify(faceDescriptor), signature, normalizedWallet, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Application not found" });

    res.json({ message: "Identity verified and locked for review.", application: result.rows[0] });
  } catch (err) {
    console.error("Notary Verification Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notaries/applications (Admin only)
router.get("/applications", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  try {
    // Only show applications that completed biometric verification (not 'pending' = form-only)
    // user_id is NULL until approval, so query notary_applications directly
    const result = await pool.query(`
      SELECT 
        na.id as application_id,
        na.full_name as name,
        na.full_name,
        na.email,
        na.wallet_address,
        na.license_number,
        na.nationality,
        na.phone,
        na.experience,
        na.national_id_number,
        na.status,
        na.created_at as application_date
      FROM notary_applications na
      WHERE na.status IN ('pending', 'APPLIED', 'KYC_VERIFIED', 'approved')
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notaries/applications/:id/verify-kyc (Admin only)
router.post("/applications/:id/verify-kyc", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE notary_applications SET status = 'KYC_VERIFIED', updated_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Application not found" });

    res.json({ message: "KYC verified for this application.", application: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notaries/applications/:id/approve (Admin only)
router.post("/applications/:id/approve", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  const { id } = req.params; // APPLICATION ID
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the application
    const appRes = await client.query(
      "SELECT * FROM notary_applications WHERE id = $1",
      [id]
    );
    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Application not found" });
    }
    const app = appRes.rows[0];

    if (app.status === 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Application already approved" });
    }

    // 2. Check for account collisions (Zero-Trust Identity Protection)
    const collisionCheck = await client.query(
      "SELECT id, role, email, wallet_address FROM users WHERE wallet_address = $1 OR email = $2 OR username = $2",
      [app.wallet_address.toLowerCase(), app.email.toLowerCase()]
    );

    let newUser;
    if (collisionCheck.rows.length > 0) {
      const existingUser = collisionCheck.rows[0];

      // If the user matches perfectly but was somehow disconnected from the application, we reuse it
      const matchEmail = existingUser.email.toLowerCase() === app.email.toLowerCase();
      const matchWallet = existingUser.wallet_address.toLowerCase() === app.wallet_address.toLowerCase();

      if (matchEmail && matchWallet) {
        console.log(`[APPROVAL] Existing user found for ${app.email}. Re-linking.`);
        newUser = existingUser;
      } else {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: "Identity collision.",
          detail: "A user already exists with this email or wallet but has different credentials. Manual intervention required."
        });
      }
    } else {
      // 3. Create a NEW user account for the notary from application data
      const userRes = await client.query(
        `INSERT INTO users (username, name, email, password_hash, wallet_address, national_id_hash, face_descriptor, wallet_nonce, role, kyc_verified, liveness_status, identity_state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'notary', true, 'verified', 'KYC_VERIFIED', NOW(), NOW())
         RETURNING *`,
        [app.email, app.full_name, app.email, app.password_hash, app.wallet_address, app.national_id_hash, app.face_descriptor, app.wallet_nonce]
      );
      newUser = userRes.rows[0];
    }

    // 4. Link application to the new user and mark approved
    await client.query(
      "UPDATE notary_applications SET user_id = $1, status = 'approved', updated_at = NOW() WHERE id = $2",
      [newUser.id, id]
    );

    // 5. On-Chain Registration (Zero-Trust Lifecycle)
    try {
      const { triggerOnChainRegistration } = require('../services/identity-sync.js');
      // This will handle the transition: KYC_VERIFIED -> ONCHAIN_PENDING -> ACTIVE
      await triggerOnChainRegistration(newUser.id);
    } catch (blockchainErr) {
      console.error("[BLOCKCHAIN_CRITICAL] On-chain identity sync failed during approval:", blockchainErr.message);
      throw new Error(`On-chain identity sync failed: ${blockchainErr.message}. DB changes rolled back.`);
    }

    await client.query('COMMIT');
    res.json({ message: "Notary account created and application approved", user: newUser });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Approve Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/notaries/applications/:id/reject (Admin only)
router.post("/applications/:id/reject", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  const { id } = req.params; // APPLICATION ID

  try {
    // Since no user account was created yet (that happens on approval),
    // we simply mark the application as rejected
    const result = await pool.query(
      "UPDATE notary_applications SET status = 'rejected', updated_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json({ message: "Notary application rejected", application: result.rows[0] });
  } catch (err) {
    console.error("Reject Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// READ All Notaries
router.get("/", requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, COALESCE(na.full_name, u.name) as name, COALESCE(na.email, u.email) as email, u.role, u.wallet_address,
             na.full_name, na.national_id_number, na.nationality, na.phone, na.experience
      FROM users u
      LEFT JOIN notary_applications na ON u.id = na.user_id
      WHERE u.role = 'notary'
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ Notary by ID
router.get("/:id", requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1 AND role = 'notary'", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Notary not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
