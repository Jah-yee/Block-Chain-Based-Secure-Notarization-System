const express = require("express");
const router = express.Router();
const pool = require("../db/index.js");
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic, withGuestContext } = require("../middleware/actor.js");
const bcrypt = require("bcrypt");
const { registerNotaryOnChain } = require("../blockchain/notary-registry");
const emailService = require("../services/EmailService");
const crypto = require("crypto");
const { notarySchema, validateBody, normalizeNationalId } = require("../utils/validation.js");
const { logAction } = require("../utils/logger");
const { withDomain, withAction, withMutation } = require("../middleware/policy.js");
const { verifyProtocolSignature } = require("../utils/identity-crypto");
const { ACTOR_IDS } = require('../constants/protocol');

// Apply actor loading middleware
// router.use(loadActor) deprecated for zero-trust compliance

// PUBLIC: Check application status
router.get("/applications/status/:id", allowPublic, requirePrivilege({ capability: 'NOTARY_APP_VERIFY', allowPublic: true }), async (req, res) => {
  const { id } = req.params;
  
  // 🛡️ [Hardening] Prevent 500 on 'undefined' or non-numeric IDs unless they match reference_id format
  if (!id || id === 'undefined' || (isNaN(Number(id)) && !id.startsWith('BBSNS-REG-'))) {
    return res.status(400).json({
      status: "error",
      data: null,
      error: "Invalid application identifier"
    });
  }

  try {
    const isReference = id.startsWith('BBSNS-REG-');
    const query = isReference 
      ? "SELECT id, reference_id, status, email FROM notary_applications WHERE reference_id = $1"
      : "SELECT id, reference_id, status, email FROM notary_applications WHERE id = $1";

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        status: "error", 
        data: null, 
        error: "Application not found" 
      });
    }
    res.json({
      status: "ok",
      data: result.rows[0],
      error: null
    });
  } catch (err) {
    console.error(`[GUARD] Status lookup failure for ${id}:`, err);
    res.status(500).json({ 
      status: "error", 
      data: null, 
      error: "System error: Failed to fetch application status" 
    });
  }
});

/**
 * 🛡️ [AUDIT] Check on-chain role status
 * Used by Admin Management to show Red/Green sync dots.
 */
router.get("/onchain-role/:address", requirePrivilege({ capability: 'GOV_PROPOSAL_LIST', minRole: ROLES.ADMIN }), async (req, res) => {
    const { address } = req.params;
    if (!address) return res.status(400).json({ error: "Address required" });

    try {
        const ConfigService = require('../services/config.service');
        const ProviderService = require('../blockchain/provider-service');
        const { ethers } = require('ethers');

        const config = await ConfigService.getConfig();
        const provider = await ProviderService.getProvider();
        
        const registry = new ethers.Contract(
            config.contracts.notaryRegistry, 
            ["function getUserRole(address) view returns (uint8)"], 
            provider
        );
        
        const liveRole = await registry.getUserRole(address);
        
        res.json({
            status: "ok",
            data: {
                address,
                role: Number(liveRole),
                isOnChain: Number(liveRole) === 2 // 2 = Notary in BBSNS Protocol
            }
        });
    } catch (err) {
        console.error("[ONCHAIN_AUDIT_ERROR]", err);
        res.status(500).json({ error: "Failed to verify on-chain state" });
    }
});

// PUBLIC: Submit initial notary application
router.post("/applications/public", withDomain('NOTARY'), allowPublic, requirePrivilege({ capability: 'NOTARY_APP_SUBMIT', allowPublic: true }), withGuestContext, validateBody(notarySchema), withAction('NOTARY_APP_SUBMIT'), withMutation(), async (req, res) => {
  const { fullName, email, walletAddress, phone, license, experience, nationalId, nationality } = req.body;

  try {
    await pool.runWithContext({
      userId: ACTOR_IDS.GUEST,
      reason: 'NOTARY_APP_SUBMIT',
      route: req.originalUrl,
      requestId: req.requestId || 'UNKNOWN',
      service: 'NOTARY_SERVICE'
    }, async (auditClient) => {
      const normalizedId = normalizeNationalId(nationalId);
      const nationalIdHash = normalizedId ? crypto.createHash('sha256').update(normalizedId).digest('hex') : null;

      // 🛡️ [Hardening] 1. Check if application already exists in notary_applications (for resume logic)
      const queryParts = ["email = $1"];
      const queryParams = [email.toLowerCase()];

      if (walletAddress) {
        queryParts.push("wallet_address = $" + (queryParams.length + 1));
        queryParams.push(walletAddress.toLowerCase());
      }

      if (normalizedId) {
        queryParts.push("national_id_number = $" + (queryParams.length + 1));
        queryParams.push(normalizedId);
      }

      const existing = await auditClient.query(
        `SELECT * FROM notary_applications WHERE ${queryParts.join(" OR ")}`,
        queryParams
      );

      if (existing.rows.length > 0) {
        const app = existing.rows[0];
        if (app.status === 'approved' || app.status === 'activated') {
          const err = new Error("Professional already registered.");
          err.statusCode = 400;
          throw err;
        }

        const RESUMABLE_STATES = ['pending'];
        if (RESUMABLE_STATES.includes(app.status)) {
          let referenceId = app.reference_id;
          if (!referenceId) {
            const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
            referenceId = `BBSNS-REG-${suffix}`;
            await auditClient.query("UPDATE notary_applications SET reference_id = $1 WHERE id = $2", [referenceId, app.id]);
          }

          await auditClient.query(`
            UPDATE notary_applications 
            SET phone = $1, experience = $2, nationality = $3, national_id_number = $4, national_id_hash = $5, updated_at = NOW()
            WHERE id = $6
          `, [phone, experience, nationality, normalizedId, nationalIdHash, app.id]);

          res.status(200).json({
            status: "ok",
            data: {
              message: "Application session synchronized. Resuming verification.",
              id: app.id,
              reference_id: referenceId,
              status: app.status,
              resumed: true
            },
            error: null
          });
          return;
        }

        const err = new Error("Application already exists.");
        err.statusCode = 400;
        err.data = { id: app.id, status: app.status };
        throw err;
      }

      // 🛡️ [Hardening] 2. Global Identity Check (Cross-table uniqueness)
      // This is a NEW application, so it must be unique across USERS and APPLICATIONS.
      const UserService = require('../services/UserService');
      await UserService.checkGlobalUniqueness({
        email,
        walletAddress,
        nationalIdHash,
        nationalIdNumber: normalizedId
      }, auditClient);

      // Generate BBSNS-REG-XXXX reference
      const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const referenceId = `BBSNS-REG-${suffix}`;

      // 🛡️ [Hardening] 3. Record application
      const result = await auditClient.query(`
        INSERT INTO notary_applications 
        (full_name, email, wallet_address, phone, license_number, experience, national_id_number, national_id_hash, nationality, status, reference_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
        RETURNING id, reference_id
      `, [fullName, email.toLowerCase(), walletAddress ? walletAddress.toLowerCase() : null, phone, license, experience, normalizedId, nationalIdHash, nationality, referenceId]);

      res.status(201).json({
        status: "ok",
        data: {
          message: "Application recorded. Proceed to biometric verification.",
          id: result.rows[0].id,
          reference_id: result.rows[0].reference_id
        },
        error: null
      });
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ 
        status: "error", 
        data: err.data || null, 
        error: err.message 
      });
    }
    console.error("Public App Error:", err);
    res.status(500).json({ 
      status: "error", 
      data: null, 
      error: "System error: Failed to record application" 
    });
  }
});

// PUBLIC: Finalize application with face descriptor & signature
router.post("/applications/:id/verify", withDomain('NOTARY'), allowPublic, requirePrivilege({ capability: 'NOTARY_APP_VERIFY', allowPublic: true }), withAction('NOTARY_APP_VERIFY'), withMutation(), async (req, res) => {
  const { id } = req.params;
  const { signature, faceDescriptor, walletAddress, nonce } = req.body;

  try {
    const normalizedWallet = (walletAddress || "").toLowerCase();

    if (!normalizedWallet || !signature || !nonce) {
      return res.status(400).json({ 
        status: "error", 
        data: null, 
        error: "walletAddress, nonce, and signature are required" 
      });
    }

    // 🛡️ [Hardening] Deterministic Protocol Verification (Atomic Nonce Consumption)
    // Replaces legacy 'Notary binding request for BBSNS: {nonce}' string.
    // Uses protocol-standard: BBSNS::NOTARY_BIND::v1::{nonce}::{wallet}
    await pool.runWithContext({
      userId: ACTOR_IDS.GUEST,
      reason: 'NOTARY_APP_VERIFY',
      route: req.originalUrl,
      requestId: req.requestId || 'NOTARY_VERIFY',
      service: 'AUTH_SERVICE'
    }, async (auditClient) => {
      try {
        await verifyProtocolSignature({
          purpose: 'NOTARY_BIND',
          nonce,
          wallet: normalizedWallet,
          signature,
          rawPayload: {},
          version: 'v1',
          client: auditClient,
          requestId: req.requestId || 'NOTARY_APP_VERIFY'
        });
      } catch (authErr) {
        const err = new Error(authErr.message || 'Cryptographic verification failed');
        err.statusCode = 401;
        throw err;
      }

      // Update Application State
      // 🛡️ [Hardening] Atomic Transition: pending -> KYC_VERIFIED
      const isReference = (id || "").startsWith('BBSNS-REG-');
      const lookupField = isReference ? "reference_id" : "id";
      const appCheck = await auditClient.query(`SELECT status FROM notary_applications WHERE ${lookupField} = $1`, [id]);
      if (appCheck.rows.length === 0) {
        const err = new Error('Application not found');
        err.statusCode = 404;
        throw err;
      }

      const currentStatus = appCheck.rows[0].status;
      
      if (['KYC_VERIFIED', 'approved', 'activated'].includes(currentStatus)) {
        const err = new Error('ALREADY_PROCESSED: Identity is already verified or active.');
        err.statusCode = 409;
        throw err;
      }

      if (currentStatus !== 'pending') {
        const err = new Error(`INVALID_TRANSITION: Cannot verify application in '${currentStatus}' state.`);
        err.statusCode = 409;
        throw err;
      }

      // 🛡️ [Hardening] Prevent 500 on duplicate wallet during verification
      const walletConflict = await auditClient.query(
        "SELECT id FROM notary_applications WHERE wallet_address = $1 AND id != $2",
        [normalizedWallet, id]
      );

      if (walletConflict.rows.length > 0) {
        const err = new Error('This wallet is already linked to another application.');
        err.statusCode = 409;
        throw err;
      }

      const result = await auditClient.query(
        `UPDATE notary_applications SET face_descriptor = $1, wallet_nonce = $2, wallet_address = $3, status = 'KYC_VERIFIED', updated_at = NOW() WHERE ${lookupField} = $4 RETURNING *`,
        [JSON.stringify(faceDescriptor), signature, normalizedWallet, id]
      );

      logAction('NOTARY_STATUS_CHANGE', `System verified identity for app ${id}`, 'system', { id, from: currentStatus, to: 'KYC_VERIFIED' });

      return result.rows[0];
    }).then((application) => {
      res.json({
        status: "ok",
        data: {
          message: "Identity verified successfully. Waiting for administrative approval.",
          application
        },
        error: null
      });
    });
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({ status: "error", data: null, error: err.message });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({ status: "error", error: err.message });
    }
    if (err.statusCode === 409) {
      return res.status(409).json({ status: "error", error: err.message });
    }
    console.error("Notary Verification Error:", err);
    res.status(500).json({ 
      status: "error", 
      data: null, 
      error: "System error: Verification failed" 
    });
  }
});

// GET /api/notaries/applications (Admin only)
router.get("/applications", requirePrivilege({ capability: 'NOTARY_APP_LIST' }), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        na.id as application_id,
        na.full_name as name,
        na.email,
        na.wallet_address,
        na.license_number,
        na.nationality,
        na.phone,
        na.experience,
        na.national_id_number as national_id,
        na.status,
        na.created_at as application_date,
        u.role as current_role
      FROM notary_applications na
      LEFT JOIN users u ON LOWER(na.wallet_address) = LOWER(u.wallet_address)
      WHERE na.status IN ('KYC_VERIFIED', 'approved', 'activated', 'rejected')
      ORDER BY na.created_at DESC
    `);
    res.json({
      status: "ok",
      data: result.rows,
      error: null
    });
  } catch (err) {
    res.status(500).json({ 
      status: "error", 
      data: [], 
      error: "System error: Failed to fetch applications" 
    });
  }
});


// POST /api/notaries/applications/:id/approve (Admin only)
router.post("/applications/:id/approve", withDomain('NOTARY'), requirePrivilege({ capability: 'NOTARY_APP_APPROVE' }), withAction('NOTARY_APP_APPROVE'), withMutation(), async (req, res) => {
  const { id } = req.params;
  
  try {
    const isReference = (id || "").startsWith('BBSNS-REG-');
    const lookupField = isReference ? "reference_id" : "id";
    const appRes = await pool.query(`SELECT * FROM notary_applications WHERE ${lookupField} = $1`, [id]);
    if (appRes.rows.length === 0) {
      return res.status(404).json({ status: "error", error: "Application not found" });
    }
    const app = appRes.rows[0];

    // FSM Guard
    if (app.status === 'approved' || app.status === 'activated') {
      return res.status(409).json({ status: "error", error: "ALREADY_PROCESSED: Application already approved or active" });
    }
    if (app.status !== 'KYC_VERIFIED') {
      return res.status(403).json({ status: "error", error: `FORBIDDEN: Application in '${app.status}' state. Identity verification required.` });
    }

    // 🛡️ [Hardening FIX A] PRE-FLIGHT EMAIL VALIDATION
    // We attempt to send the email BEFORE committing the status change to the DB.
    const activationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 🛡️ Extended to 12 hours for UX resilience

    const emailAttempt = await emailService.sendActivationEmail(app.email, activationToken);
    
    if (!emailAttempt.success) {
      logAction('EMAIL_FAILURE', `Failed to send activation email for app ${id}`, 'system', { error: emailAttempt.error });
      return res.status(503).json({ 
        status: "error", 
        error: "SMTP_FAILURE: Could not send activation email. Status NOT updated.",
        details: "Check mail server configuration or recipient email address."
      });
    }

    // 🛡️ [Hardening FIX A] ATOMIC COMMIT
    const client = await pool.connect();
    try {
      // 🛡️ [PHASE 1] Atomic Commit of Application Status
      await client.query('BEGIN');
      await client.query(
        `UPDATE notary_applications SET 
           status = 'approved', 
           activation_token = $1, 
           activation_expires_at = $2,
           is_activated = false,
           email_status = 'sent',
           updated_at = NOW() 
         WHERE ${lookupField} = $3`,
        [activationToken, expiresAt, id]
      );

      // 🛡️ [PHASE 2] Pre-Provision User to trigger IMMEDIATE on-chain promotion
      // We use a placeholder hash that can never be guessed.
      const placeholderHash = `PENDING_ACTIVATION_${crypto.randomBytes(16).toString('hex')}`;
      const nationalIdHash = app.national_id_hash || crypto.createHash('sha256').update(app.national_id_number || "PENDING").digest('hex');

      const userData = {
        username: app.email.toLowerCase(),
        name: app.full_name,
        email: app.email.toLowerCase(),
        wallet_address: app.wallet_address.toLowerCase(),
        password_hash: placeholderHash,
        role: 'notary',
        identity_state: 'PENDING',
        role_tx_status: 'initiated', // 🚀 Trigger Sync Worker NOW
        national_id_hash: nationalIdHash,
        is_human_verified: true,
        kyc_verified: true
      };

      const UserService = require('../services/UserService');
      
      // 🛡️ [Hardening FIX] Upgrade existing user OR Create new
      // This prevents the "duplicate key" crash if the applicant was already an Owner.
      const existingUserRes = await client.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [app.email]);
      let userRecord;

      if (existingUserRes.rowCount > 0) {
        userRecord = existingUserRes.rows[0];
        
        // 🛡️ [Hardening] Fetch current role to determine state transition
        const roleCheck = await client.query("SELECT role, identity_state FROM users WHERE id = $1", [userRecord.id]);
        const currentRole = roleCheck.rows[0].role;
        const currentState = roleCheck.rows[0].identity_state;
        
        // Only reset to PENDING if they were a basic 'user' (Owner)
        const newState = currentRole === 'user' ? 'PENDING' : currentState;

        // Upgrade existing user to Notary
        await client.query(
          `UPDATE users SET 
             role = 'notary',
             name = $1,
             wallet_address = $2,
             national_id_hash = $3,
             role_tx_status = 'initiated',
             role_retry_count = 0,
             identity_state = $4,
             is_human_verified = true,
             kyc_verified = true,
             updated_at = NOW()
           WHERE id = $5`,
          [app.full_name, app.wallet_address.toLowerCase(), nationalIdHash, newState, userRecord.id]
        );
        userRecord = { id: userRecord.id };
      } else {
        // Create new user record
        userRecord = await UserService.createUser(userData, client);
      }

      // Link application to the user record (new or upgraded)
      await client.query(
        "UPDATE notary_applications SET user_id = $1 WHERE id = $2",
        [userRecord.id, app.id]
      );
      
      logAction('NOTARY_STATUS_CHANGE', `Admin approved app ${id} and initiated on-chain promotion`, req.actor?.email || 'admin', { id, from: app.status, to: 'approved', userId: userRecord.id });
      await client.query('COMMIT');

      res.json({
        status: "ok",
        data: { message: "Application approved and email delivered.", applicationId: id, expiresAt }
      });
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Approve Error:", err);
    res.status(500).json({ status: "error", error: "System error: Failed to approve application" });
  }
});

// 🛡️ [Hardening FIX B] Activation Recovery (Resend Token)
router.post("/applications/:id/resend-activation", withDomain('NOTARY'), requirePrivilege({ capability: 'NOTARY_TOKEN_RESEND' }), withAction('NOTARY_TOKEN_RESEND'), withMutation(), async (req, res) => {
  const { id } = req.params;
  try {
    const isReference = (id || "").startsWith('BBSNS-REG-');
    const lookupField = isReference ? "reference_id" : "id";
    const appRes = await pool.query(`SELECT * FROM notary_applications WHERE ${lookupField} = $1`, [id]);
    if (appRes.rows.length === 0) return res.status(404).json({ status: "error", error: "Application not found" });
    const app = appRes.rows[0];

    if (app.status !== 'approved') {
      return res.status(400).json({ status: "error", error: `Cannot resend token for application in '${app.status}' state.` });
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 🛡️ Extended to 12 hours

    const emailAttempt = await emailService.sendActivationEmail(app.email, activationToken);
    if (!emailAttempt.success) {
      return res.status(503).json({ status: "error", error: "Failed to resend activation email." });
    }

    await pool.query(
      `UPDATE notary_applications SET activation_token = $1, activation_expires_at = $2, email_status = 'sent', updated_at = NOW() WHERE ${lookupField} = $3`,
      [activationToken, expiresAt, id]
    );

    res.json({ status: "ok", data: { message: "Activation email resent.", expiresAt } });
  } catch (err) {
    console.error("Resend Error:", err);
    res.status(500).json({ status: "error", error: "Internal server error" });
  }
});

// POST /api/notaries/applications/:id/reject (Admin only)
router.post("/applications/:id/reject", withDomain('NOTARY'), requirePrivilege({ capability: 'NOTARY_APP_REJECT' }), withAction('NOTARY_APP_REJECT'), withMutation(), async (req, res) => {
  const { id } = req.params;
  try {
    const isReference = (id || "").startsWith('BBSNS-REG-');
    const lookupField = isReference ? "reference_id" : "id";
    const appCheck = await pool.query(`SELECT status, user_id, email, wallet_address FROM notary_applications WHERE ${lookupField} = $1`, [id]);
    if (appCheck.rows.length === 0) {
      return res.status(404).json({ status: "error", error: "Application not found" });
    }
    const currentStatus = appCheck.rows[0].status;
    const appData = appCheck.rows[0];

    if (currentStatus === 'rejected') {
      return res.status(409).json({ status: "error", error: "ALREADY_PROCESSED: Application already rejected" });
    }

    if (!['pending', 'KYC_VERIFIED'].includes(currentStatus)) {
      return res.status(403).json({ 
        status: "error", 
        error: `FORBIDDEN: Cannot reject application in '${currentStatus}' state.` 
      });
    }

    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      
      result = await client.query(
        `UPDATE notary_applications SET 
          status = 'rejected', 
          phone = NULL,
          license_number = NULL,
          experience = NULL,
          national_id_number = NULL,
          national_id_hash = NULL,
          nationality = NULL,
          face_descriptor = NULL,
          updated_at = NOW() 
        WHERE ${lookupField} = $1 RETURNING *`,
        [id]
      );
      
      if (appData.user_id) {
         await client.query(`
            UPDATE users SET
              role = CASE WHEN role = 'notary' THEN 'user' ELSE role END,
              identity_state = 'REJECTED',
              national_id_hash = NULL,
              is_human_verified = false,
              kyc_verified = false
            WHERE id = $1
         `, [appData.user_id]);
      } else if (appData.wallet_address) {
         await client.query(`
            UPDATE users SET
              role = CASE WHEN role = 'notary' THEN 'user' ELSE role END,
              identity_state = 'REJECTED',
              national_id_hash = NULL,
              is_human_verified = false,
              kyc_verified = false
            WHERE LOWER(wallet_address) = LOWER($1)
         `, [appData.wallet_address]);
      }
      
      await client.query('COMMIT');
    } catch(e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    logAction('NOTARY_STATUS_CHANGE', `Admin rejected app ${id}`, req.actor?.email || 'admin', { id, from: currentStatus, to: 'rejected' });

    try {
        const emailService = require("../services/EmailService");
        await emailService.sendRejectionEmail(appData.email);
    } catch(e) {
        console.warn("Could not send rejection email:", e.message);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", data: null, error: "Application not found" });
    }

    res.json({
      status: "ok",
      data: {
        message: "Notary application rejected",
        application: result.rows[0]
      },
      error: null
    });
  } catch (err) {
    res.status(500).json({ status: "error", data: null, error: "System error: Failed to reject application" });
  }
});

// READ All Notaries
router.get("/", requirePrivilege({ capability: 'NOTARY_LIST' }), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, COALESCE(na.full_name, u.name) as name, COALESCE(na.email, u.email) as email, u.role, u.wallet_address,
             na.full_name, na.national_id_number, na.nationality, na.phone, na.experience
      FROM users u
      LEFT JOIN notary_applications na ON u.id = na.user_id
      WHERE u.role = 'notary'
    `);
    res.json({
      status: "ok",
      data: result.rows,
      error: null
    });
  } catch (err) {
    res.status(500).json({ status: "error", data: [], error: "System error: Failed to fetch notaries" });
  }
});

// READ Notary by ID
router.get("/:id", requirePrivilege({ capability: 'NOTARY_READ' }), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1 AND role = 'notary'", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", data: null, error: "Notary not found" });
    }
    res.json({
      status: "ok",
      data: result.rows[0],
      error: null
    });
  } catch (err) {
    res.status(500).json({ status: "error", data: null, error: "System error: Failed to fetch notary details" });
  }
});


// POST /api/notaries/applications/:id/sync-settle (Admin only)
// Manually settle a promotion initiated by an admin wallet
router.post("/applications/:id/sync-settle", withDomain('NOTARY'), requirePrivilege({ capability: 'NOTARY_APP_APPROVE' }), withAction('NOTARY_APP_APPROVE'), withMutation(), async (req, res) => {
  const { id } = req.params;
  const { txHash } = req.body;

  if (!txHash) {
    return res.status(400).json({ status: "error", error: "txHash is required" });
  }

  try {
    const isReference = (id || "").startsWith('BBSNS-REG-');
    const lookupField = isReference ? "reference_id" : "id";
    
    // Update the user record associated with this application
    const appRes = await pool.query(`SELECT wallet_address FROM notary_applications WHERE ${lookupField} = $1`, [id]);
    if (appRes.rows.length === 0) {
      return res.status(404).json({ status: "error", error: "Application not found" });
    }
    
    const wallet = appRes.rows[0].wallet_address.toLowerCase();

    await pool.query(
      `UPDATE users SET 
         role_tx_hash = $1,
         role_tx_status = 'confirmed',
         role_status_updated_at = NOW(),
         updated_at = NOW()
       WHERE wallet_address = $2`,
      [txHash, wallet]
    );

    res.json({ status: "success", message: "Promotion settled manually" });
  } catch (err) {
    console.error("[SYNC_SETTLE_ERROR]", err);
    res.status(500).json({ status: "error", error: "Failed to settle promotion" });
  }
});

module.exports = router;
