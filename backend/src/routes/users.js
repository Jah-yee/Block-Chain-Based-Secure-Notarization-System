const express = require("express");
const router = express.Router();
const pool = require("../db/index.js");
const { hashPassword } = require("../utils/password.js");
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic } = require("../middleware/actor.js");
const { requireSystemActivated } = require("../middleware/activation.js");
const UserService = require("../services/UserService");

const multer = require("multer");
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit (KYC Hardening)
});


const { userSchema, validateBody } = require("../utils/validation.js");
const { ethers } = require('ethers');

// REGISTER User (public)
router.post("/register", allowPublic, requireSystemActivated, upload.single('nationalIdFile'), validateBody(userSchema), async (req, res) => {
  // 🛡️ [Hardening] Backend is the final authority for input normalization
  const body = req.body || {};
  
  const name = body.fullName; // userSchema ensures this exists and matches regex
  const email = body.email;
  const password = body.password;
  const nationalId = body.nationalId || body.nationalIdText;
  const signature = body.signature || body.wallet_nonce;
  
  if (!signature) {
    return res.status(400).json({ status: 'error', error: 'Cryptographic signature is required' });
  }

  // Handle faceDescriptor (may be stringified JSON from FormData)
  let faceDescriptor = body.faceDescriptor;
  if (typeof faceDescriptor === 'string') {
    try { faceDescriptor = JSON.parse(faceDescriptor); } catch (e) { console.error("JSON parse failed for descriptor", e); }
  }

  console.log("[REGISTER_DEBUG] Standardized input received. Initiating Signature Recovery...");

  let recoveredWallet;
  try {
    // 🛡️ [Hardening] Derive wallet address ONLY from signature as per Validation Contract
    // 1. Fetch valid nonce
    const nonceResult = await pool.query(
      "SELECT nonce FROM wallet_nonces WHERE LOWER(wallet_address) = LOWER($1) AND used_at IS NULL AND expiry > NOW() ORDER BY created_at DESC LIMIT 1",
      [body.walletAddress] // We use the provided wallet as a HINT to find the nonce, but signature is the AUTHORITY.
    );

    if (nonceResult.rows.length === 0) {
      return res.status(401).json({ status: 'error', error: 'Authentication challenge expired or not found' });
    }

    const nonce = nonceResult.rows[0].nonce;
    const message = `Login request for BBSNS: ${nonce}`;
    recoveredWallet = ethers.verifyMessage(message, signature).toLowerCase();

    // 2. Validate recovered address matches the hint (if provided) or fulfills ERC-20 format
    if (body.walletAddress && recoveredWallet !== body.walletAddress.toLowerCase()) {
      return res.status(401).json({ status: 'error', error: 'Identity mismatch: Signature does not match public key' });
    }
  } catch (err) {
    console.error("[REGISTER_DEBUG] Signature verification crashed:", err);
    return res.status(401).json({ status: 'error', error: 'Signature verification failed' });
  }

  const normalizedWalletAddress = recoveredWallet;

  // Check if email or wallet exists
  const existing = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(wallet_address) = $2',
    [email, normalizedWalletAddress]
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Email or wallet address already registered' });
  }

  console.log("[REGISTER_DEBUG] Inputs validated. Hashing sensitive data...");
  const password_hash = await hashPassword(password);

  const crypto = require('crypto');
  const national_id_hash = nationalId ? crypto.createHash('sha256').update(nationalId).digest('hex') : null;

  console.log("[REGISTER_DEBUG] Data hashed. Inserting into DB...");

  try {
    const user = await UserService.createUser({
      username: email.toLowerCase().trim(),
      name,
      email: email.toLowerCase().trim(),
      wallet_address: normalizedWalletAddress,
      password_hash,
      national_id_hash,
      face_descriptor: JSON.stringify(faceDescriptor),
      wallet_nonce: signature,
      role: 'user',
      is_human_verified: true,
      identity_state: 'ACTIVE'
    });

    console.log("[REGISTER_DEBUG] Registration successful for:", email);
    res.status(201).json(user);
  } catch (err) {
    console.error("[REGISTER_DEBUG] FATAL REGISTRATION ERROR:", err);
    if (err.code === '23505') {
      const field = err.detail.includes('email') ? 'Email' : err.detail.includes('wallet') ? 'Wallet' : 'User';
      return res.status(409).json({ error: `${field} already registered` });
    }
    res.status(500).json({ error: err.message });
  }
});

// Apply actor loading middleware to all routes except register
// router.use(loadActor) deprecated for zero-trust compliance

// CREATE User (Admin only)
router.post("/", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), validateBody(userSchema), async (req, res) => {
  const { username, fullName: name, email, password, walletAddress: wallet_address, role } = req.body;
  try {
    const normalizedWalletAddress = wallet_address.toLowerCase();
    // Check for duplicate email or wallet
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(wallet_address) = $2',
      [email, normalizedWalletAddress]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or wallet address already registered' });
    }
    const password_hash = await hashPassword(password);
    const result = await pool.query(
      "INSERT INTO users (username, name, email, password_hash, wallet_address, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, name, email, wallet_address, role, created_at",
      [username || name, name, email, password_hash, normalizedWalletAddress, role || 'user']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// READ All Users
router.get("/", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ User by ID
router.get("/:id", requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE User
router.put("/:id", requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  const { username, email, password, wallet_address, role, kyc_status, liveness_status, national_id_hash } = req.body;

  // Prevent wallet_address update
  if (wallet_address !== undefined) {
    return res.status(400).json({ error: "Wallet address update is not allowed" });
  }

  // Role enforcement: only admin can change role
  if (role !== undefined && Number(req.actor.role) < ROLES.ADMIN) {
    return res.status(403).json({ error: 'Insufficient role' });
  }

  try {
    // Check for duplicate email
    if (email !== undefined) {
      const emailCheck = await pool.query("SELECT id FROM users WHERE email=$1 AND id <> $2", [email, req.params.id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }

    // Build update query dynamically
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (password !== undefined) {
      const password_hash = await hashPassword(password);
      fields.push(`password_hash = $${paramIndex++}`);
      values.push(password_hash);
    }
    if (role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    // Handle liveness_status (prefer explicit field, fallback to legacy kyc_status)
    const newStatus = liveness_status !== undefined ? liveness_status : kyc_status;
    if (newStatus !== undefined) {
      fields.push(`liveness_status = $${paramIndex++}`);
      values.push(newStatus);
    }
    if (national_id_hash !== undefined) {
      fields.push(`national_id_hash = $${paramIndex++}`);
      values.push(national_id_hash);
    }
    // Allow updating face_descriptor (legacy 'descriptor' or 'faceDescriptor')
    const descriptor = req.body.faceDescriptor || req.body.descriptor;
    if (descriptor !== undefined) {
      fields.push(`face_descriptor = $${paramIndex++}`);
      // Ensure it's stored as JSON
      values.push(typeof descriptor === 'string' ? descriptor : JSON.stringify(descriptor));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const query = `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;
    values.push(req.params.id);

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SOFT DELETE User (Admin only)
router.delete("/:id", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET is_deactivated = true, deactivated_at = NOW() WHERE id = $1 RETURNING id, is_deactivated",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
