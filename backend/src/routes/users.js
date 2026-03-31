const express = require("express");
const router = express.Router();
const pool = require("../db/index.js");
const { hashPassword } = require("../utils/password.js");
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic } = require("../../middleware/actor.js");
const { requireSystemActivated } = require("../../middleware/activation.js");

const multer = require("multer");
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Validation functions
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password) {
  return password && password.length >= 8;
}

function validateWallet(walletAddress) {
  const walletRegex = /^0x[a-fA-F0-9]{40}$/;
  return walletRegex.test(walletAddress);
}

// REGISTER User (public)
router.post("/register", allowPublic, requireSystemActivated, upload.single('nationalIdFile'), async (req, res) => {
  // Multer populates req.body with text fields and req.file with the file
  const body = req.body || {};
  
  // Align Frontend vs Backend field names
  const name = body.name || body.fullName;
  const email = body.email;
  const walletAddress = body.walletAddress;
  const password = body.password;
  const nationalId = body.nationalId || body.nationalIdText;
  const signature = body.signature || body.wallet_nonce;
  
  // Handle faceDescriptor (may be stringified JSON from FormData)
  let faceDescriptor = body.faceDescriptor;
  if (typeof faceDescriptor === 'string') {
    try { faceDescriptor = JSON.parse(faceDescriptor); } catch (e) { console.error("JSON parse failed for descriptor", e); }
  }

  console.log("[REGISTER_DEBUG] Received registration request:", { ...body, password: '[REDACTED]', faceDescriptor: '...', hasFile: !!req.file });

  if (!name || !email || !walletAddress || !password) {
    console.error("[REGISTER_DEBUG] VALDIATION FAILED: Missing required fields", { name:!!name, email:!!email, wallet:!!walletAddress, pass:!!password });
    return res.status(400).json({ error: 'name, email, walletAddress, and password are required' });
  }

  // Validate inputs
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  if (!validateWallet(walletAddress)) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }

  const normalizedWalletAddress = walletAddress.toLowerCase();

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
    const result = await pool.query(
      'INSERT INTO users (username, name, email, wallet_address, password_hash, national_id_hash, face_descriptor, wallet_nonce, role, liveness_status, kyc_verified, identity_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, name, email, wallet_address, created_at, role, liveness_status, identity_state',
      [
        email, 
        name, 
        email, 
        normalizedWalletAddress, 
        password_hash, 
        national_id_hash, 
        JSON.stringify(faceDescriptor), 
        signature, 
        'user', 
        'pass',
        true,
        'PENDING'
      ]
    );
    console.log("[REGISTER_DEBUG] Registration successful for:", email);
    res.status(201).json(result.rows[0]);
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
router.post("/", requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  const { username, name, email, password, wallet_address, role } = req.body;
  if (!name || !email || !password || !wallet_address) {
    return res.status(400).json({ error: 'name, email, password, and wallet_address are required' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  if (!validateWallet(wallet_address)) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }
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
