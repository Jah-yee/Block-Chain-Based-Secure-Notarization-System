const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { requirePrivilege, ROLES, RISK_LEVELS } = require('../../middleware/actor');
const { requireSystemActivated } = require('../../middleware/activation');
const { documentCreateSchema, documentUpdateSchema } = require('../utils/validation');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const { connectBNB } = require("../blockchain/connection.js");
const { Logger, SIGNALS, ERROR_TYPES, ERROR_STAGES } = require("../services/logger.service");
const logger = new Logger('API_DOCUMENTS');
const reputationService = require('../services/reputation.service');
const storageService = require('../services/storage.service');
const ConfigService = require('../services/config.service');

// Configure Multer for secure memory-safe uploads
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // Default 10MB
  }
});

// Function to sanitize document response (exclude internal fields)
function sanitizeDocument(doc) {
  // DERIVED STATUS LOGIC (Gated Integrity)
  let derivedStatus = doc.submission_state; // Default to base state (pending, rejected, submitted_to_blockchain)

  if (doc.chain_confirmed) {
    derivedStatus = 'approved';
  } else if (doc.submission_state === 'submitted_to_blockchain') {
    derivedStatus = 'verifying'; // Show 'verifying' while waiting for on-chain confirmation
  }

  return {
    id: doc.id,
    user_id: doc.user_id,
    owner_wallet: doc.owner_wallet || null,
    filename: doc.filename,
    file_hash: doc.file_hash,
    // Dual-Field Support: Use storage_key exclusively (per latest schema)
    storage_key: doc.storage_key || null,
    storage_state: doc.storage_state || 'STORED',
    type: (doc.storage_key || '').split('.').pop() || null,
    status: derivedStatus,
    submission_state: doc.submission_state,
    chain_confirmed: doc.chain_confirmed,
    notary_id: doc.notary_id,
    notary_wallet: doc.notary_wallet || null,
    approval_tx_hash: doc.approval_tx_hash || null,
    rejection_reason: doc.rejection_reason,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    ntkr_sent: doc.ntkr_sent || 0
  };
}

// Note: We no longer use router.use(loadActor) globally to enforce per-route capability

const { requireUnpaused } = require('../middleware/circuit-breaker');

// NTKR contract ABI — only the event we need to decode
const NTKR_ABI = ['event BurnedForUpload(address indexed user, uint256 amount, bytes32 intentId)'];

// Helper: UUID string → bytes32 hex (strip dashes, left-pad with zeros)
function uuidToBytes32(uuid) {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padStart(64, '0');
}

// ─── POST /api/documents/initiate ─────────────────────────────────────────
// STEP 1: Receive file, hash it, create upload intent, return payment params.
// Document is NOT created here — only after on-chain burn is verified.
router.post('/initiate', requireUnpaused, requireSystemActivated, requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), memoryUpload.single('file'), async (req, res) => {
  try {
    const actor = req.actor;
    if (!actor)    return res.status(401).json({ error: 'Actor header required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // 1. MIME + Extension Validation
    if (!storageService.validateFile(req.file.size, req.file.mimetype, req.file.originalname)) {
      return res.status(400).json({ error: 'Invalid file type or size exceeded.' });
    }

    // 2. Cost
    const category = parseInt(req.body.category) || 0;
    const cost     = category === 1 ? 5 : 1;
    const costWei  = (BigInt(cost) * 1000000000000000000n).toString();

    // 3. Server-side SHA-256 hash authority (from buffer)
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const filename = req.body.filename || req.file.originalname;

    // 3. Reject duplicate file hashes
    const existing = await pool.query(
      'SELECT id FROM documents WHERE file_hash=$1 AND is_deleted=false', [fileHash]
    );
    if (existing.rows.length > 0) {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      return res.status(409).json({ error: 'This document has already been notarized.' });
    }

    // 4. Require linked wallet
    const userRes = await pool.query('SELECT wallet_address FROM users WHERE id=$1', [actor.id]);
    const walletAddress = userRes.rows[0]?.wallet_address;
    if (!walletAddress || !walletAddress.startsWith('0x')) {
      return res.status(400).json({ error: 'No linked wallet. Please link a wallet before uploading.' });
    }

    const intentId = crypto.randomUUID();
    let storage_key = null;
    let filepath = null;

    // 5. STORAGE DECISION: S3 vs Local (Zero-Downtime Migration Support)
    const isS3Configured = !!process.env.AWS_S3_BUCKET;

    if (isS3Configured) {
      storage_key = `intents/${actor.id}/${intentId}/${filename}`;
      await storageService.uploadFile(req.file.buffer, storage_key, req.file.mimetype);
      console.log(`[STORAGE] Uploaded to S3: ${storage_key} | intentId=${intentId}`);
    } else {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const diskFilename = `file-${uniqueSuffix}${path.extname(filename)}`;
      filepath = path.join('uploads', diskFilename);
      const fullPath = path.join(__dirname, '../../', filepath);
      const uploadDir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(fullPath, req.file.buffer);
      console.log(`[STORAGE] Saved locally: ${filepath} | intentId=${intentId}`);
    }

    // 6. DB TRANSACTION (Atomic Intent Creation)
    let intent;
    try {
      const intentRes = await pool.query(
        `INSERT INTO upload_intents
           (id, user_id, wallet_address, file_hash, filename, storage_key, category, amount, amount_wei, storage_state, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'AWAITING_PAYMENT', NOW() + INTERVAL '30 minutes')
         RETURNING id, expires_at`,
        [intentId, actor.id, walletAddress.toLowerCase(), fileHash, filename, storage_key || filepath, category, cost, costWei, storage_key ? 'UPLOADED' : 'STORED']
      );
      intent = intentRes.rows[0];
    } catch (dbErr) {
      // 7. COMPENSATING CLEANUP (Transaction Safety)
      console.error(`[STORAGE_CRITICAL] DB insert failed. Cleaning up storage for intent ${intentId}.`);
      if (storage_key) await storageService.deleteFile(storage_key).catch(() => {});
      else if (filepath) try { fs.unlinkSync(path.join(__dirname, '../../', filepath)); } catch(e) {}
      throw dbErr;
    }

    console.log(`[INITIATE] intent=${intent.id} user=${actor.id} hash=${fileHash} mode=${storage_key ? 'S3' : 'LOCAL'}`);

    // AUTHORITATIVE CONFIG RESOLUTION
    const config = await ConfigService.getConfig();

    res.status(201).json({
      intent_id:         intent.id,
      intent_id_bytes32: uuidToBytes32(intent.id),
      file_hash:         fileHash,
      amount:            cost,
      amount_wei:        costWei,
      ntkr_contract:     config.contracts.ntkr,
      expires_at:        intent.expires_at,
      storage_mode:      storage_key ? 'S3' : 'LOCAL'
    });
  } catch (err) {
    console.error('[INITIATE] Error:', err);
    res.status(500).json({ error: 'Failed to initiate upload process.' });
  }
});

// ─── POST /api/documents/confirm ──────────────────────────────────────────
// STEP 2: User submits txHash after calling NTKR.burnForUpload() in their wallet.
// Backend performs 8 strict on-chain verification guards, then creates document.
router.post('/confirm', requireUnpaused, requireSystemActivated, requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  const { intent_id, tx_hash } = req.body;
  if (!intent_id || !tx_hash) {
    return res.status(400).json({ error: 'intent_id and tx_hash are required' });
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(tx_hash)) {
    return res.status(400).json({ error: 'Invalid tx_hash format' });
  }

  const client = await pool.connect();
  try {
    const actor = req.actor;

    // 🛡️ Guard 1: Lock intent and verify ownership
    const intentRes = await client.query(
      'SELECT * FROM upload_intents WHERE id=$1 FOR UPDATE', [intent_id]
    );
    if (intentRes.rows.length === 0) return res.status(404).json({ error: 'Upload intent not found' });
    const intent = intentRes.rows[0];

    // Split-Brain Check: Is another node/API already processing this?
    const now = new Date();
    if (intent.processing_lock_until && intent.processing_lock_until > now) {
      return res.status(423).json({ error: 'Intent is currently being processed by another worker. Please wait.' });
    }

    if (Number(intent.user_id) !== Number(actor.id)) {
      return res.status(403).json({ error: 'Forbidden: intent belongs to a different user' });
    }

    // 🛡️ Guard 2: State Guard (Idempotency)
    if (intent.status === 'COMPLETED') {
        const existingDoc = await client.query('SELECT * FROM documents WHERE payment_tx_hash=$1', [intent.payment_tx_hash]);
        return res.status(200).json({ 
            message: 'Already processed.', 
            document: existingDoc.rows[0] ? sanitizeDocument(existingDoc.rows[0]) : null,
            tx_hash: intent.payment_tx_hash 
        });
    }
    if (intent.status === 'FAILED_FINAL') return res.status(410).json({ error: 'Intent failed permanently due to data mismatch.' });

    // 🛡️ Guard 3: Expiry Check
    if (intent.status === 'EXPIRED' || new Date(intent.expires_at) < now) {
      if (intent.status !== 'EXPIRED') {
          await client.query("UPDATE upload_intents SET status='EXPIRED' WHERE id=$1", [intent_id]);
      }
      return res.status(410).json({ error: 'Upload intent expired. Start a new upload.' });
    }

    // 🛡️ Guard 4: tx_hash uniqueness across layers
    const txUsed = await client.query(
      `SELECT 1 FROM upload_intents WHERE payment_tx_hash=$1 AND id != $2
       UNION ALL SELECT 1 FROM documents WHERE payment_tx_hash=$1 LIMIT 1`, [tx_hash, intent_id]
    );
    if (txUsed.rows.length > 0) return res.status(409).json({ error: 'Transaction hash already used.' });

    // ── ON-CHAIN VERIFICATION ──
    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Lock for this API node (Lease)
    const lockUntil = new Date(Date.now() + 60000); // 1 minute lease
    const nodeId = crypto.randomUUID(); // Simplified node identifier for this request
    await client.query(
        "UPDATE upload_intents SET processing_lock_until=$1, processing_node_id=$2 WHERE id=$3",
        [lockUntil, nodeId, intent_id]
    );

    let receipt;
    try {
      receipt = await provider.getTransactionReceipt(tx_hash);
      if (!receipt) return res.status(202).json({ message: 'Transaction not yet mined.', tx_hash });
      
      // 🛡️ Guard 5: Confirmations
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;
      if (confirmations < 3) {
          return res.status(202).json({ 
              message: `Waiting for 3 confirmations (Current: ${confirmations}).`, 
              confirmations,
              tx_hash 
          });
      }

      if (receipt.status !== 1) {
          await client.query("UPDATE upload_intents SET status='FAILED_FINAL' WHERE id=$1", [intent_id]);
          return res.status(400).json({ error: 'Transaction reverted on-chain. Intent failed.' });
      }
    } catch (rpcErr) {
      return res.status(502).json({ error: 'Blockchain RPC unreachable. Payment state preserved.' });
    }

    // 🛡️ Guard 6: Contract & Event Validation
    const ntkrAddr = (config.contracts.ntkr || '').toLowerCase();
    if (receipt.to.toLowerCase() !== ntkrAddr) {
      return res.status(400).json({ error: 'Transaction sent to wrong contract.' });
    }

    const iface = new ethers.Interface(NTKR_ABI);
    let burnEvent = null;
    for (const log of receipt.logs) {
      try { 
          if (log.address.toLowerCase() !== ntkrAddr) continue;
          const p = iface.parseLog(log); 
          if (p?.name === 'BurnedForUpload') { burnEvent = p; break; } 
      } catch {}
    }
    if (!burnEvent) return res.status(400).json({ error: 'BurnedForUpload event not found in logs.' });

    // 🛡️ Guard 7: Business Logic Integrity (PoNR Verification)
    const expectedBytes32 = uuidToBytes32(intent_id);
    const burnWallet = burnEvent.args.user.toLowerCase();
    const burnIntentId = burnEvent.args.intentId.toLowerCase();
    const burnAmount = BigInt(burnEvent.args.amount.toString());
    const requiredAmount = BigInt(intent.amount_wei);

    if (burnWallet !== intent.wallet_address.toLowerCase() || 
        burnIntentId !== expectedBytes32.toLowerCase() || 
        burnAmount < requiredAmount) {
        
        await client.query("UPDATE upload_intents SET status='FAILED_FINAL' WHERE id=$1", [intent_id]);
        return res.status(400).json({ 
            error: 'Payment validation failed (Integrity Mismatch).',
            details: { walletMatch: burnWallet === intent.wallet_address.toLowerCase(), amountMatch: burnAmount >= requiredAmount }
        });
    }

    // ── POINT OF NO RETURN (PoNR) ──
    // 1. PAYMENT_VERIFIED
    await client.query("UPDATE upload_intents SET status='PAYMENT_VERIFIED', payment_tx_hash=$1 WHERE id=$2", [tx_hash, intent_id]);

    // 2. DOC_CREATED
    const docRes = await client.query(
      `INSERT INTO documents
         (user_id, filename, storage_key, file_hash, submission_state, ntkr_sent, payment_tx_hash, storage_state, created_at, updated_at, is_deleted)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,NOW(),NOW(),false) RETURNING *`,
      [intent.user_id, intent.filename, intent.storage_key, intent.file_hash, intent.amount, tx_hash, intent.storage_key.startsWith('intents/') ? 'STORED' : 'STORED']
    );
    const newDoc = docRes.rows[0];
    await client.query("UPDATE upload_intents SET status='DOC_CREATED' WHERE id=$1", [intent_id]);

    // 3. COMPLETED
    await client.query(
      `INSERT INTO ntkr_transactions (user_id, document_id, tx_type, amount, tx_hash, status, note, created_at)
       VALUES ($1,$2,'burn',$3,$4,'success','verified on-chain',NOW())`,
      [intent.user_id, newDoc.id, intent.amount, tx_hash]
    );
    await client.query("UPDATE upload_intents SET status='COMPLETED', processing_lock_until=NULL, processing_node_id=NULL WHERE id=$1", [intent_id]);

    await client.query('COMMIT');
    
    // Non-blocking notary assignment
    setImmediate(async () => {
      try { await reputationService.assignNotary(newDoc.id); }
      catch (e) { console.error(`[ASSIGNMENT] ${e.message}`); }
    });

    res.status(201).json({ message: 'Success.', document: sanitizeDocument(newDoc), tx_hash });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[CONFIRM] Error:', err);
    res.status(500).json({ error: 'Confirmation failed' });
  } finally {
    client.release();
  }
});

// ─── GET /api/documents/intent/:id ────────────────────────────────────────
// Frontend polls this while waiting for user to complete their wallet TX.
router.get('/intent/:id', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, status, file_hash, amount, amount_wei, expires_at, payment_tx_hash, filepath, storage_key
       FROM upload_intents WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.actor.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Intent not found' });
    const i = r.rows[0];
    const expired = i.status === 'awaiting_payment' && new Date(i.expires_at) < new Date();
    res.json({
      intent_id:       i.id,
      status:          expired ? 'expired' : i.status,
      file_hash:       i.file_hash,
      amount:          i.amount,
      amount_wei:      i.amount_wei,
      expires_at:      i.expires_at,
      seconds_left:    Math.max(0, Math.floor((new Date(i.expires_at) - Date.now()) / 1000)),
      payment_tx_hash: i.payment_tx_hash
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch intent' }); }
});

router.get('/', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  console.error('[DEBUG_DOCS] Hit GET /documents');
  try {
    if (!req.actor) return res.status(401).json({ error: 'Actor header required' });

    let query;
    let params = [];

    const role = Number(req.actor.role);

    if (role === ROLES.ADMIN) {
      query = `SELECT d.*, u.wallet_address as notary_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               WHERE d.is_deleted=false 
               ORDER BY d.created_at DESC`;
    } else if (role === ROLES.NOTARY) {
      query = `SELECT d.*, u.wallet_address as notary_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               WHERE d.notary_id=$1 
               AND d.is_deleted=false 
               ORDER BY d.created_at DESC`;
      params = [req.actor.id];
    } else {
      query = `SELECT d.*, u.wallet_address as notary_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               WHERE d.user_id=$1 AND d.is_deleted=false 
               ORDER BY d.created_at DESC`;
      params = [req.actor.id];
    }

    const r = await pool.query(query, params);
    // Sanitize results
    const sanitized = r.rows.map(sanitizeDocument);
    res.json(sanitized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/documents/:id/signature-payload
// Provides the EIP-712 payload for a notary to sign
router.get('/:id/signature-payload', requirePrivilege({ minRole: ROLES.NOTARY, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const { status } = req.query; // 'approved' or 'rejected'

    if (!status || (status !== 'approved' && status !== 'rejected')) {
      return res.status(400).json({ error: 'Valid status (approved/rejected) is required in query' });
    }

    const query = `
      SELECT d.*, u2.wallet_address as owner_wallet 
      FROM documents d 
      LEFT JOIN users u2 ON d.user_id = u2.id
      WHERE d.id = $1 AND d.is_deleted = false
    `;
    const r = await pool.query(query, [paramId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    
    const doc = r.rows[0];
    const notaryId = Number(req.actor.id);
    const notaryWallet = req.actor.address;

    if (Number(doc.notary_id) !== notaryId && Number(req.actor.role) !== ROLES.ADMIN) {
      return res.status(403).json({ error: 'Not authorized for this document' });
    }

    if (!notaryWallet) {
      return res.status(400).json({ error: 'Active notary wallet not found in session' });
    }

    // 1. Fetch Protocol Nonce from Contract & Authoritative Config
    const { contract } = await connectBNB();
    const config = await ConfigService.getConfig();
    const nonce = await contract.nonces(notaryWallet);

    // 2. Prepare EIP-712 Payload
    const domain = {
      name: "BBSNS_Protocol",
      version: "1",
      chainId: Number(config.chainId),
      verifyingContract: config.contracts.documentRegistry
    };

    const types = {
      Notarize: [
        { name: 'docHash', type: 'bytes32' },
        { name: 'ownerAddress', type: 'address' },
        { name: 'status', type: 'uint8' },
        { name: 'summaryHash', type: 'bytes32' },
        { name: 'rejectionReasonHash', type: 'bytes32' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'nonce', type: 'uint256' }
      ]
    };

    // Note: statusInt must match Solidity enum (1 = APPROVED, 2 = REJECTED)
    const statusInt = status === 'approved' ? 1 : 2;
    const docHash = doc.file_hash.startsWith('0x') ? doc.file_hash : `0x${doc.file_hash}`;

    // Frontend will provide summary/rejection text, so we return placeholders.
    // However, the signature depends on THESE hashes.
    // We expect the frontend to tell us what text they are signing, 
    // BUT to keep it deterministic, we'll let the frontend provide the text hashes IF they already have them,
    // OR just tell them the current timestamp and nonce to use.
    
    // Actually, Phase 1 requires BACKEND to generate the message.
    // So we need to KNOW the summary/rejection reason.
    // Let's assume the client sends 'summary' or 'reason' in query for payload generation.
    const summary = req.query.summary || "";
    const reason = req.query.reason || "";
    const timestamp = Math.floor(Date.now() / 1000);

    const summaryHash = ethers.keccak256(ethers.toUtf8Bytes(summary));
    const rejectionReasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));

    const message = {
      docHash: docHash,
      ownerAddress: doc.owner_wallet,
      status: statusInt,
      summaryHash: summaryHash,
      rejectionReasonHash: rejectionReasonHash,
      timestamp: timestamp,
      nonce: nonce.toString() // Return as string for JSON
    };

    res.json({
      domain,
      types,
      message,
      metadata: {
        summary_used: summary,
        reason_used: reason
      }
    });

  } catch (err) {
    console.error('Payload Generation Error:', err);
    res.status(500).json({ error: 'Failed to generate signature payload' });
  }
});

router.get('/:id', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const { id: paramId } = req.params;
    let query;
    let queryParams;

    // Detect if the parameter is a 64-character hex hash (SHA-256)
    const isHash = /^[a-fA-F0-9]{64}$/.test(paramId);

    if (isHash) {
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.wallet_address as owner_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               LEFT JOIN users u2 ON d.user_id = u2.id
               WHERE d.file_hash=$1 AND d.is_deleted=false`;
      queryParams = [paramId];
    } else {
      if (isNaN(paramId)) return res.status(400).json({ error: 'Invalid document ID or Hash format' });
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.wallet_address as owner_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               LEFT JOIN users u2 ON d.user_id = u2.id
               WHERE d.id=$1 AND d.is_deleted=false`;
      queryParams = [parseInt(paramId)];
    }

    const r = await pool.query(query, queryParams);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = r.rows[0];
    if (!req.actor) return res.status(401).json({ error: 'Actor header required' });
    const role = Number(req.actor.role);
    const userId = Number(req.actor.id);
    const docUserId = Number(doc.user_id);
    const docNotaryId = doc.notary_id ? Number(doc.notary_id) : null;

    // Authorization Matrix:
    // 1. Admins see everything
    // 2. Owners see their own documents
    // 3. Notaries see ONLY documents assigned to them (Phase 9: no global queue)
    const isOwner = userId === docUserId;
    const isAssignedNotary = docNotaryId !== null && userId === docNotaryId;

    if (role !== ROLES.ADMIN && !isOwner && !isAssignedNotary) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(sanitizeDocument(doc));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Download Document File
router.get('/:id/file', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const { id: paramId } = req.params;
    let query;
    let queryParams;

    // Detect if the parameter is a 64-character hex hash (SHA-256)
    const isHash = /^[a-fA-F0-9]{64}$/.test(paramId);

    if (isHash) {
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.wallet_address as owner_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               LEFT JOIN users u2 ON d.user_id = u2.id
               WHERE d.file_hash=$1 AND d.is_deleted=false`;
      queryParams = [paramId];
    } else {
      if (isNaN(paramId)) return res.status(400).json({ error: 'Invalid document ID or Hash format' });
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.wallet_address as owner_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               LEFT JOIN users u2 ON d.user_id = u2.id
               WHERE d.id=$1 AND d.is_deleted=false`;
      queryParams = [parseInt(paramId)];
    }

    const r = await pool.query(query, queryParams);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = r.rows[0];

    const role = Number(req.actor.role);
    const userId = Number(req.actor.id);
    const docUserId = Number(doc.user_id);
    const docNotaryId = doc.notary_id ? Number(doc.notary_id) : null;

    const isOwner = userId === docUserId;
    const isAssignedNotary = docNotaryId !== null && userId === docNotaryId;

    if (role !== ROLES.ADMIN && !isOwner && !isAssignedNotary) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // ── AUTH-FIRST SIGNED URL BOUNDARY ──
    if (doc.storage_key) {
      try {
        const signedUrl = await storageService.getSignedDownloadUrl(doc.storage_key, 300); // 5 minutes
        console.log(`[STORAGE] Generated signed URL for doc ${doc.id}`);
        return res.json({ download_url: signedUrl, filename: doc.filename });
      } catch (s3Err) {
        console.error(`[STORAGE] S3 signed URL failed for doc ${doc.id}: ${s3Err.message}`);
        return res.status(502).json({ error: 'Failed to retrieve cloud file.' });
      }
    }

    // Fallback: Local Filesystem (Zero-Downtime Migration Support)
    let filePath = doc.filepath;
    if (filePath) {
      if (!path.isAbsolute(filePath)) {
        filePath = path.join(__dirname, '../../', filePath);
      }
      if (fs.existsSync(filePath)) {
        return res.download(filePath, doc.filename);
      }
    }

    return res.status(404).json({ error: 'Document file not found on any storage layer.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

const { sendApprovalTx } = require('../utils/blockchain');

// Unified Update Route (Owner metadata OR Notary Action)
router.patch('/:id', requireUnpaused, requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  // SECURITY: For high-risk notary actions, we must escalate to live-check
  if (req.body.signature) {
    const escalation = requirePrivilege({ minRole: ROLES.NOTARY, risk: RISK_LEVELS.HIGH });
    return escalation(req, res, async () => {
      // Recalculate actor if needed or just proceed
      return handleDocumentPatch(req, res);
    });
  }
  return handleDocumentPatch(req, res);
});

async function handleDocumentPatch(req, res) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid document ID format' });
    const actor = req.actor;
    const role = Number(actor.role);

    const docQuery = await client.query('SELECT * FROM documents WHERE id=$1 AND is_deleted=false', [parseInt(id)]);
    if (docQuery.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = docQuery.rows[0];

    // Case 1: Notary Action (Approval/Rejection with Signature)
    if (req.body.signature) {
      if (role !== ROLES.NOTARY && role !== ROLES.ADMIN) {
        return res.status(403).json({ error: 'Notary or Admin role required for signing' });
      }

      const { status, signature, timestamp, document_summary, rejection_reason } = req.body;

      // 0. LOCKING: Prevent re-submission or modifications to verified docs
      if (doc.chain_confirmed || doc.submission_state === 'submitted_to_blockchain') {
        return res.status(403).json({ error: 'Document is already in verification or confirmed. Cannot modify action.' });
      }

      // 1. RE-VERIFY FILE INTEGRITY (Hash Authority)
      let fileBuffer;
      if (doc.storage_key) {
        try {
          fileBuffer = await storageService.getFileBuffer(doc.storage_key);
        } catch (s3Err) {
          return res.status(502).json({ error: 'Cloud file integrity check failed. Source missing.' });
        }
      } else if (doc.filepath) {
        let filePath = doc.filepath;
        if (!path.isAbsolute(filePath)) filePath = path.join(__dirname, '../../', filePath);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'Local source file missing. Cannot notarize.' });
        }
        fileBuffer = fs.readFileSync(filePath);
      } else {
        return res.status(404).json({ error: 'Document source missing from all storage.' });
      }

      const currentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      if (currentHash !== doc.file_hash) {
        return res.status(409).json({ error: 'Integrity Mismatch: File has been tampered with since upload.' });
      }

      // 2. CRYPTOGRAPHIC ENFORCEMENT & LOCAL RECOVERY
      // Resolve document owner wallet for EIP-712 compliance
      const ownerRes = await client.query('SELECT wallet_address FROM users WHERE id = $1', [doc.user_id]);
      const ownerAddress = ownerRes.rows[0]?.wallet_address;

      if (!ownerAddress) {
        return res.status(400).json({ error: 'Document owner has no registered wallet. Cannot notarize on-chain.' });
      }

      // Recompute hashes for summary/rejection to satisfy contract parameters
      const summaryStr = document_summary || "";
      const rejectionStr = rejection_reason || "";
      const summaryHash = ethers.keccak256(ethers.toUtf8Bytes(summaryStr));
      const rejectionHash = ethers.keccak256(ethers.toUtf8Bytes(rejectionStr));
      const docHashBytes = doc.file_hash.startsWith('0x') ? doc.file_hash : `0x${doc.file_hash}`;
      const statusInt = status === 'rejected' ? 2 : 1;
      const dbStatus = status === 'rejected' ? 'rejected' : 'submitted_to_blockchain';

      // 🔐 ATOMIC CLAIM + LOCK + INTENT (Hardened Phase 3 + Observability Phase 7)
      const correlationId = req.correlationId;
      const claimRes = await client.query(
        `UPDATE documents SET
           idempotency_key = file_hash,
           tx_status = 'initiated',
           processing_started_at = NOW(),
           notary_id = $1,
           document_summary = $2,
           rejection_reason = $3,
           correlation_id = $4,
           status_updated_at = NOW()
         WHERE id = $5 
           AND (idempotency_key IS NULL OR tx_status = 'failed' OR tx_status = 'initiated')
           AND chain_confirmed = false
         RETURNING *`,
        [actor.id, document_summary, rejection_reason, correlationId, id]
      );

      if (claimRes.rows.length === 0) {
        return res.status(403).json({ error: 'Document is already being processed or is confirmed.' });
      }

      const previous_state = doc.submission_state;
      const claimedDoc = claimRes.rows[0];
      logger.info('TASK_CLAIMED', { 
        id, 
        correlation_id: correlationId, 
        previous_state, 
        new_state: claimedDoc.submission_state 
      });

      // 🔐 MANDATORY ON-CHAIN PRE-FLIGHT
      const preFlightStart = Date.now();
      const { provider, contract } = await connectBNB();
      logger.info('PRE_FLIGHT_CHECK', { id, correlation_id: correlationId, hash: docHashBytes });
      const onChainData = await contract.getDocument(docHashBytes);
      const preFlightDuration = Date.now() - preFlightStart;
      logger.info('PRE_FLIGHT_COMPLETED', { id, correlation_id: correlationId, duration_ms: preFlightDuration });
      
      if (onChainData.exists && Number(onChainData.status) > 0) {
        logger.info('DUPLICATE_PREVENTED', { id, correlation_id: correlationId, reason: 'Already on-chain' });
        const finalRes = await client.query(
          "UPDATE documents SET submission_state = $1, chain_confirmed = true, tx_status = 'confirmed', status_updated_at = NOW() WHERE id = $2 RETURNING *",
          [onChainData.status === 1n ? 'submitted_to_blockchain' : 'rejected', id]
        );
        return res.json(sanitizeDocument(finalRes.rows[0]));
      }

      // 🔐 SIGNATURE RECOVERY & BROADCAST
      const notaryAddressInContext = actor.address || actor.wallet_address;
      const nonceFromContract = await contract.nonces(notaryAddressInContext);
      
      const domain = {
        name: "BBSNS_Protocol",
        version: "1",
        chainId: Number(process.env.CHAIN_ID || 97),
        verifyingContract: process.env.DOCUMENT_REGISTRY_ADDRESS
      };

      const types = {
        Notarize: [
          { name: 'docHash', type: 'bytes32' },
          { name: 'ownerAddress', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'summaryHash', type: 'bytes32' },
          { name: 'rejectionReasonHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'nonce', type: 'uint256' }
        ]
      };

      const message = {
        docHash: docHashBytes,
        ownerAddress: ownerAddress,
        status: statusInt,
        summaryHash: summaryHash,
        rejectionReasonHash: rejectionHash,
        timestamp: parseInt(timestamp),
        nonce: nonceFromContract.toString()
      };

      try {
        const recoveredSigner = ethers.verifyTypedData(domain, types, message, signature);
        const expectedAddress = (actor.address || actor.wallet_address || "").toLowerCase();
        
        if (!recoveredSigner || recoveredSigner.toLowerCase() !== expectedAddress) {
          await client.query("UPDATE documents SET tx_status = 'failed' WHERE id = $1", [id]);
          return res.status(401).json({ error: 'Invalid signature or recovery failure.' });
        }

        const txSendStart = Date.now();
        const txResult = await sendApprovalTx(
          docHashBytes,
          ownerAddress,
          status,
          signature,
          parseInt(timestamp),
          summaryHash,
          rejectionHash,
          recoveredSigner
        );
        const txSendDuration = Date.now() - txSendStart;

        logger.info('TX_SENT', { 
          id, 
          correlation_id: correlationId, 
          tx_hash: txResult.txHash,
          previous_state: claimedDoc.submission_state,
          new_state: 'submitted_to_blockchain', // Or dbStatus
          duration_ms: txSendDuration
        });

        // Update DB to 'pending' with tx_hash
        const updateRes = await client.query(
          `UPDATE documents SET
            submission_state = $1,
            tx_hash = $2,
            tx_status = 'pending',
            needs_cleanup = true,
            updated_at = NOW(),
            status_updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [dbStatus, txResult.txHash, id]
        );

        // Fire reputation event (non-blocking)
        try {
          if (dbStatus === 'submitted_to_blockchain') {
            await reputationService.handleEvent(actor.id, 'APPROVE', parseInt(id));
          } else if (dbStatus === 'rejected') {
            await reputationService.handleEvent(actor.id, 'REJECT', parseInt(id), { rejection_reason });
          }
        } catch (repErr) {
          console.error(`[REPUTATION] Event fire failed (non-fatal) | docId=${id} | error=${repErr.message}`);
        }

        const isApprovedOrRejected = (dbStatus === 'submitted_to_blockchain' || dbStatus === 'rejected');
        const isChainSuccess = txResult.receipt && txResult.receipt.status === 1;
        const isFinalized = isChainSuccess && isApprovedOrRejected;

        if (isFinalized) {
            setImmediate(async () => {
                try {
                    const freshDocRes = await pool.query('SELECT storage_key, storage_state FROM documents WHERE id=$1', [id]);
                    if (freshDocRes.rows.length > 0) {
                        const freshDoc = freshDocRes.rows[0];
                        if (freshDoc.storage_state === 'UPLOADED' || (freshDoc.storage_key && freshDoc.storage_key.startsWith('intents/'))) {
                            await storageService.deleteFile(freshDoc.storage_key).catch(err => {
                                logger.error('FILE_DELETE_FAILED', { id, key: freshDoc.storage_key, error: err.message });
                            });
                        } else {
                            let localPath = freshDoc.storage_key;
                            if (localPath) {
                                if (!path.isAbsolute(localPath)) localPath = path.join(__dirname, '../../', localPath);
                                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                            }
                        }
                        
                        await pool.query('UPDATE documents SET needs_cleanup = false WHERE id=$1', [id]);
                        logger.info('FILE_DELETED_SUCCESSFULLY', { id, storage_key: freshDoc.storage_key });
                    }
                } catch (err) {
                    logger.error('FILE_DELETE_FAILED', { id, error: err.message });
                }
            });
        }

        return res.json(sanitizeDocument(updateRes.rows[0]));
      } catch (txErr) {
        logger.error('TX_FAILED', { 
          id, 
          correlation_id: correlationId, 
          error_type: ERROR_TYPES.RPC, 
          error_stage: ERROR_STAGES.SEND,
          previous_state: claimedDoc.submission_state,
          new_state: 'failed'
        }, txErr);
        await client.query(
          "UPDATE documents SET tx_status = 'failed', last_error = $1, updated_at = NOW(), status_updated_at = NOW() WHERE id = $2", 
          [JSON.stringify({ type: ERROR_TYPES.RPC, stage: ERROR_STAGES.SEND, message: txErr.message }), id]
        );
        return res.status(502).json({ error: 'Blockchain alignment failed.', details: txErr.message });
      }
    }

    // Case 2: Owner/Admin Metadata Update (Name/Type)
    if (role !== ROLES.ADMIN && Number(actor.id) !== Number(doc.user_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Prevent name changes once submitted (Submission Locking)
    if (doc.submission_state !== 'pending' && role !== ROLES.ADMIN) {
      return res.status(403).json({ error: 'Cannot modify documents once submitted/verified' });
    }

    const { error, value } = documentUpdateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
    }

    const { name, type } = value;
    const r = await client.query(
      `UPDATE documents SET
        filename=COALESCE($1, filename),
        updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [name, id]
    );

    res.status(200).json(sanitizeDocument(r.rows[0]));
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Patch Error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  } finally {
    client.release();
  }
}

// Status change (Notary/Admin) - Supported via PUT for Desktop compatibility
router.put('/:id', requirePrivilege({ minRole: ROLES.NOTARY, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid document ID format' });
    const { status, rejection_reason } = req.body;
    const actor = req.actor;

    const role = Number(actor.role);

    if (!actor || (role !== ROLES.NOTARY && role !== ROLES.ADMIN)) {
      return res.status(403).json({ error: 'Notary or Admin role required' });
    }

    const docQuery = await pool.query('SELECT * FROM documents WHERE id=$1 AND is_deleted=false', [parseInt(id)]);
    if (docQuery.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const result = await pool.query(
      `UPDATE documents SET
        submission_state = $1,
        rejection_reason = $2,
        notary_id = $3,
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, rejection_reason, actor.id, id]
    );

    res.json(sanitizeDocument(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.delete('/:id', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid document ID format' });
    const actor = req.actor;
    if (!actor) return res.status(401).json({ error: 'Actor header required' });

    const docQuery = await pool.query('SELECT * FROM documents WHERE id=$1 AND is_deleted=false', [parseInt(id)]);
    if (docQuery.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = docQuery.rows[0];

    const role = Number(actor.role);
    if (role !== ROLES.ADMIN && Number(actor.id) !== Number(doc.user_id)) {
      return res.status(403).json({ error: 'Only owner or admin can delete document' });
    }

    await pool.query('UPDATE documents SET is_deleted=true WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
