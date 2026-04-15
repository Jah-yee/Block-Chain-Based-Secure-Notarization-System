const express = require("express");
const router = express.Router();
const pool = require("../db/index.js");
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic } = require("../middleware/actor.js");
const bcrypt = require("bcrypt");
const { registerNotaryOnChain } = require("../blockchain/notary-registry");
const emailService = require("../services/EmailService");
const crypto = require("crypto");
const { notarySchema, validateBody } = require("../utils/validation.js");
const { logAction } = require("../utils/logger");
const { withDomain, withAction, withMutation } = require("../middleware/policy.js");
const { verifyProtocolSignature } = require("../utils/identity-crypto");
const { ACTOR_IDS } = require('../constants/protocol');

// Apply actor loading middleware
// router.use(loadActor) deprecated for zero-trust compliance

// PUBLIC: Check application status
router.get("/applications/status/:id", allowPublic, async (req, res) => {
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

// PUBLIC: Submit initial notary application
router.post("/applications/public", withDomain('NOTARY'), allowPublic, validateBody(notarySchema), withAction('NOTARY_APP_SUBMIT'), withMutation(), async (req, res) => {
  const { fullName, email, walletAddress, phone, license, experience, nationalId, nationality } = req.body;

  try {

    // GUARD: Reject if wallet already registered as a document owner (separate accounts required)
    if (walletAddress) {
      const walletInUse = await pool.query(
        "SELECT id, role FROM users WHERE wallet_address = $1",
        [walletAddress.toLowerCase()]
      );
      if (walletInUse.rows.length > 0) {
        return res.status(409).json({
          status: "error",
          data: null,
          error: "This wallet is already registered as a document owner. Notaries must use a separate wallet address."
        });
      }
    }

    // Check if wallet, email, or national ID already has a pending/approved application
    const queryParts = ["email = $1"];
    const queryParams = [email.toLowerCase()];

    if (walletAddress) {
      queryParts.push("wallet_address = $" + (queryParams.length + 1));
      queryParams.push(walletAddress.toLowerCase());
    }

    if (nationalId) {
      queryParts.push("national_id_number = $" + (queryParams.length + 1));
      queryParams.push(nationalId);
    }

    const existing = await pool.query(
      `SELECT * FROM notary_applications WHERE ${queryParts.join(" OR ")}`,
      queryParams
    );

    if (existing.rows.length > 0) {
      const app = existing.rows[0];
      if (app.status === 'approved' || app.status === 'activated') {
        return res.status(400).json({ 
          status: "error", 
          data: null, 
          error: "Professional already registered." 
        });
      }

      // If pending, allow updating the non-identity fields
      const RESUMABLE_STATES = ['pending'];
      if (RESUMABLE_STATES.includes(app.status)) {
        // Ensure reference_id exists for legacy applications
        let referenceId = app.reference_id;
        if (!referenceId) {
          const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
          referenceId = `BBSNS-REG-${suffix}`;
          await pool.query("UPDATE notary_applications SET reference_id = $1 WHERE id = $2", [referenceId, app.id]);
        }

        await pool.query(`
          UPDATE notary_applications 
          SET phone = $1, experience = $2, nationality = $3, national_id_number = $4, updated_at = NOW()
          WHERE id = $5
        `, [phone, experience, nationality, nationalId, app.id]);

        return res.status(200).json({
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
      }

      // If in professional advanced state, reject duplicate
      if (['verified', 'approved', 'activated'].includes(app.status)) {
        return res.status(409).json({
          status: "error",
          data: { id: app.id, status: app.status },
          error: "Professional identity already verified or active."
        });
      }

      return res.status(400).json({
        status: "error",
        data: { id: app.id, status: app.status },
        error: "Application already exists."
      });
    }

    const nationalIdHash = nationalId ? crypto.createHash('sha256').update(String(nationalId)).digest('hex') : null;
    
    // Generate BBSNS-REG-XXXX reference
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const referenceId = `BBSNS-REG-${suffix}`;

    // 🛡️ [Hardening 2.9C-A] password_hash removed from application state table
    const result = await pool.query(`
      INSERT INTO notary_applications 
      (full_name, email, wallet_address, phone, license_number, experience, national_id_number, national_id_hash, nationality, status, reference_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
      RETURNING id, reference_id
    `, [fullName, email.toLowerCase(), walletAddress ? walletAddress.toLowerCase() : null, phone, license, experience, nationalId, nationalIdHash, nationality, referenceId]);

    res.status(201).json({
      status: "ok",
      data: {
        message: "Application recorded. Proceed to biometric verification.",
        id: result.rows[0].id,
        reference_id: result.rows[0].reference_id
      },
      error: null
    });
  } catch (err) {
    console.error("Public App Error:", err);
    res.status(500).json({ 
      status: "error", 
      data: null, 
      error: "System error: Failed to record application" 
    });
  }
});

// PUBLIC: Finalize application with face descriptor & signature
router.post("/applications/:id/verify", withDomain('NOTARY'), allowPublic, withAction('NOTARY_APP_VERIFY'), withMutation(), async (req, res) => {
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
      // 🛡️ [Hardening] Atomic Transition: pending -> verified
      const isReference = (id || "").startsWith('BBSNS-REG-');
      const lookupField = isReference ? "reference_id" : "id";
      const appCheck = await auditClient.query(`SELECT status FROM notary_applications WHERE ${lookupField} = $1`, [id]);
      if (appCheck.rows.length === 0) {
        const err = new Error('Application not found');
        err.statusCode = 404;
        throw err;
      }

      const currentStatus = appCheck.rows[0].status;
      
      if (['verified', 'approved', 'activated'].includes(currentStatus)) {
        const err = new Error('ALREADY_PROCESSED: Identity is already verified or active.');
        err.statusCode = 409;
        throw err;
      }

      if (currentStatus !== 'pending') {
        const err = new Error(`INVALID_TRANSITION: Cannot verify application in '${currentStatus}' state.`);
        err.statusCode = 409;
        throw err;
      }

      const result = await auditClient.query(
        `UPDATE notary_applications SET face_descriptor = $1, wallet_nonce = $2, wallet_address = $3, status = 'verified', updated_at = NOW() WHERE ${lookupField} = $4 RETURNING *`,
        [JSON.stringify(faceDescriptor), signature, normalizedWallet, id]
      );

      logAction('NOTARY_STATUS_CHANGE', `System verified identity for app ${id}`, 'system', { id, from: currentStatus, to: 'verified' });

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
router.get("/applications", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
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
        na.national_id_number,
        na.status,
        na.created_at as application_date
      FROM notary_applications na
      WHERE na.status IN ('pending', 'verified', 'approved', 'activated', 'rejected')
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
router.post("/applications/:id/approve", withDomain('NOTARY'), requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), withAction('NOTARY_APP_APPROVE'), withMutation(), async (req, res) => {
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
    if (app.status !== 'verified') {
      return res.status(403).json({ status: "error", error: `FORBIDDEN: Application in '${app.status}' state. Identity verification required.` });
    }

    // 🛡️ [Hardening FIX A] PRE-FLIGHT EMAIL VALIDATION
    // We attempt to send the email BEFORE committing the status change to the DB.
    const activationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

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
      
      logAction('NOTARY_STATUS_CHANGE', `Admin approved app ${id}`, req.actor?.email || 'admin', { id, from: app.status, to: 'approved' });
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
router.post("/applications/:id/resend-activation", withDomain('NOTARY'), requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), withAction('NOTARY_TOKEN_RESEND'), withMutation(), async (req, res) => {
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
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

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
router.post("/applications/:id/reject", withDomain('NOTARY'), requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), withAction('NOTARY_APP_REJECT'), withMutation(), async (req, res) => {
  const { id } = req.params;
  try {
    const isReference = (id || "").startsWith('BBSNS-REG-');
    const lookupField = isReference ? "reference_id" : "id";
    const appCheck = await pool.query(`SELECT status FROM notary_applications WHERE ${lookupField} = $1`, [id]);
    if (appCheck.rows.length === 0) {
      return res.status(404).json({ status: "error", error: "Application not found" });
    }
    const currentStatus = appCheck.rows[0].status;

    if (currentStatus === 'rejected') {
      return res.status(409).json({ status: "error", error: "ALREADY_PROCESSED: Application already rejected" });
    }

    if (!['pending', 'verified'].includes(currentStatus)) {
      return res.status(403).json({ 
        status: "error", 
        error: `FORBIDDEN: Cannot reject application in '${currentStatus}' state.` 
      });
    }

    const result = await pool.query(
      `UPDATE notary_applications SET status = 'rejected', updated_at = NOW() WHERE ${lookupField} = $1 RETURNING *`,
      [id]
    );

    logAction('NOTARY_STATUS_CHANGE', `Admin rejected app ${id}`, req.actor?.email || 'admin', { id, from: currentStatus, to: 'rejected' });

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
router.get("/", requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
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
router.get("/:id", requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
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

module.exports = router;
