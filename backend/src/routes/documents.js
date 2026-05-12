const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const UX_CODES = require('../constants/ux-codes');
const { requirePrivilege, ROLES, RISK_LEVELS, withGuestContext } = require('../middleware/actor');
const { withDomain, withAction, withMutation } = require('../middleware/policy');
const { uploadLimiter } = require('../middleware/rate-limit');
// requireSystemActivated purged
const { documentCreateSchema, documentUpdateSchema } = require('../utils/validation');
const multer = require('multer');
const dbContext = require('../db/context');
const { withRestoredContext } = require('../middleware/context-rebinder');

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
const DocumentStatusService = require('../services/document-status.service');
const maintenanceService = require('../services/maintenance.service');
const { sendApprovalTx } = require('../utils/blockchain');

// Configure Multer for secure memory-safe uploads
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB Standard (Phase 1 Hardening)
  }
});


function sanitizeDocument(doc, actor) {
  if (!doc) return null;
  const sanitized = { ...doc };
  delete sanitized.encrypted_key;
  delete sanitized.user_id;
  delete sanitized.notary_id;

  // 🛡️ [PII_PROTECTION] Hide owner details from non-assigned Notaries (Phase 9 Hardening)
  if (actor && Number(actor.role) === ROLES.NOTARY) {
    if (doc.notary_id && Number(doc.notary_id) !== Number(actor.id)) {
      delete sanitized.owner_name;
      delete sanitized.owner_email;
      delete sanitized.owner_wallet;
    }
  }

  return sanitized;
}

function mapToDetailedDoc(doc) {
  const now = new Date();
  const createdAt = new Date(doc.created_at);
  const elapsed_ms = now.getTime() - createdAt.getTime();

  // Mapping Backend States to Authoritative UX Codes
  let uxCode = UX_CODES.NOTARY_ASSIGNMENT_PENDING;
  if (doc.submission_state === 'submitted_to_blockchain') uxCode = UX_CODES.CHAIN_TX_PENDING;
  if (doc.chain_confirmed) uxCode = UX_CODES.CHAIN_TX_CONFIRMED;
  if (doc.submission_state === 'rejected') uxCode = UX_CODES.NOTARY_REJECTED;

  // Time-Aware perception shift: If stuck in pending for > 2 mins, flag as delayed
  if (doc.submission_state === 'pending' && elapsed_ms > 120000) {
    uxCode = UX_CODES.CHAIN_SYNC_DELAYED;
  }

  const derivedStatus = (doc.submission_state === 'submitted_to_blockchain' || doc.chain_confirmed) ? 'approved' : doc.submission_state;

  return {
    id: doc.id,
    user_id: doc.user_id,
    owner_name: doc.owner_name || null,
    owner_email: doc.owner_email || null,
    owner_wallet: doc.owner_wallet || null,
    filename: doc.filename,
    title: doc.title || doc.filename,
    file_hash: doc.file_hash,
    storage_key: doc.storage_key || null,
    storage_state: doc.storage_state || 'STORED',
    type: doc.mimetype || null,
    status: (derivedStatus === 'approved' || derivedStatus === 'rejected' || derivedStatus === 'pending') ? derivedStatus : 'pending',
    state: doc.submission_state, // Raw backend state
    code: uxCode, // Transformed UX Contract code
    elapsed_ms, // Time-Aware metric
    submission_state: doc.submission_state,
    assignment_state: doc.assignment_state || 'pending',
    last_assignment_error: doc.last_assignment_error || null,
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
router.post('/initiate', withDomain('DOCS'), requireUnpaused, requirePrivilege({ capability: 'DOC_UPLOAD_INITIATE' }), withAction('DOC_UPLOAD_INITIATE'), withMutation(), uploadLimiter, withRestoredContext(memoryUpload.single('file')), async (req, res) => {
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

    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    
    // [Architectural Separation]
    // title = logical label (user-meaning)
    // filename = technical key (must preserve extension)
    const title = req.body.filename || req.file.originalname;
    
    // Hardened Phase 1: Sanitization with Extension Preservation
    const originalExt = path.extname(req.file.originalname);
    const baseName = path.basename(req.file.originalname, originalExt).replace(/[^a-zA-Z0-9-_]/g, '');
    const safeFilename = `${baseName || 'file-' + Date.now()}${originalExt}`;

    let storage_key = null;
    let filepath = null;

    // 3. Reject duplicate file hashes
    const existing = await pool.query(
      'SELECT id FROM documents WHERE file_hash=$1 AND is_deleted=false', [fileHash]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This document has already been notarized.' });
    }

    // 4. Require linked wallet
    const userRes = await pool.query('SELECT wallet_address FROM users WHERE id=$1', [actor.id]);
    const walletAddress = userRes.rows[0]?.wallet_address;
    if (!walletAddress || !walletAddress.startsWith('0x')) {
      return res.status(400).json({ error: 'No linked wallet. Please link a wallet before uploading.' });
    }

    const intentId = crypto.randomUUID();
    const fileId = crypto.randomUUID(); // Hardened Phase 0: Physical File Identifier

    // 5. STORAGE DECISION: Enforce S3 explicitly
    const isS3Configured = !!process.env.AWS_S3_BUCKET;
    if (!isS3Configured) {
      throw new Error("S3 infrastructure is missing. Silent local fallback is disabled by enforcement constraints.");
    }

    // Format: intents/{userId}/{intentId}/{fileId}
    storage_key = `intents/${actor.id}/${intentId}/${fileId}`;
    
    await storageService.uploadFile(req.file.buffer, storage_key, req.file.mimetype);
    console.log(`[STORAGE] Uploaded to S3: ${storage_key} | intentId=${intentId} | display=${safeFilename}`);

    // 6. DB TRANSACTION (Atomic Intent Creation)
    let intent;
    try {
      const intentRes = await pool.query(
        `INSERT INTO upload_intents
           (id, user_id, wallet_address, file_hash, filename, title, mimetype, storage_key, category, amount, amount_wei, storage_state, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          intentId,
          actor.id,
          actor.address || actor.walletAddress || actor.address, // Guard for possible naming diff
          fileHash,
          safeFilename,
          title,
          req.file.mimetype,
          storage_key,
          category,
          cost,
          costWei,
          'UPLOADED',
          'AWAITING_PAYMENT',
          new Date(Date.now() + 30 * 60 * 1000)
        ]
      );
      intent = intentRes.rows[0];
    } catch (dbErr) {
      // 7. COMPENSATING CLEANUP (Transaction Safety)
      console.error(`[STORAGE_CRITICAL] DB insert failed. Cleaning up storage for intent ${intentId}.`);
      if (storage_key) await storageService.deleteFile(storage_key).catch(() => {});
      throw dbErr;
    }

    const storage_mode = 'S3';
    console.log(`[INITIATE] intent=${intent.id} user=${actor.id} hash=${fileHash} mode=${storage_mode}`);

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
      storage_mode:      storage_mode
    });
  } catch (err) {
    console.error('[INITIATE] Error:', err);
    res.status(500).json({ error: 'Failed to initiate upload process.' });
  }
});

// ─── POST /api/documents/confirm ──────────────────────────────────────────
router.post('/confirm', withDomain('DOCS'), requireUnpaused, requirePrivilege({ capability: 'DOC_UPLOAD_CONFIRM' }), withAction('DOC_UPLOAD_CONFIRM'), withMutation(), async (req, res) => {
  const { intent_id, tx_hash } = req.body;
  if (!intent_id || !tx_hash) {
    return res.status(400).json({ error: 'intent_id and tx_hash are required' });
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(tx_hash)) {
    return res.status(400).json({ error: 'Invalid tx_hash format' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
    const ProviderService = require('../blockchain/provider-service');
    const provider = await ProviderService.getProvider();
    
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
         (user_id, filename, title, storage_key, file_hash, idempotency_key, submission_state, ntkr_sent, payment_tx_hash, storage_state, mimetype, created_at, updated_at, is_deleted)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,NOW(),NOW(),false) RETURNING *`,
      [
        intent.user_id, 
        intent.filename, 
        intent.title || intent.filename,
        intent.storage_key, 
        intent.file_hash, 
        intent.file_hash, // Use file_hash as authoritative idempotency_key
        intent.amount, 
        tx_hash, 
        intent.storage_key.startsWith('intents/') ? 'STORED' : 'STORED', 
        intent.mimetype
      ]
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
    
    /* 
    // Non-blocking notary assignment (Disabled for Public Pool Model)
    setImmediate(async () => {
      try { await reputationService.assignNotary(newDoc.id); }
      catch (e) { console.error(`[ASSIGNMENT] ${e.message}`); }
    });
    */

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
router.get('/intent/:id', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_INTENT_READ' }), withAction('DOC_INTENT_READ'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, status, file_hash, amount, amount_wei, expires_at, created_at, payment_tx_hash, filepath, storage_key
       FROM upload_intents WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.actor.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Intent not found' });
    const i = r.rows[0];
    const expired = i.status === 'AWAITING_PAYMENT' && new Date(i.expires_at) < new Date();
    
    // Time-Aware perception
    const now = new Date();
    const createdAt = new Date(i.created_at || now); // fallback
    const elapsed_ms = now.getTime() - createdAt.getTime();

    // Map intent internal status to UX codes
    let uxCode = UX_CODES.INTENT_CREATED;
    if (i.status === 'AWAITING_PAYMENT') uxCode = UX_CODES.INTENT_PAYMENT_PENDING;
    if (i.status === 'PAYMENT_VERIFIED') uxCode = UX_CODES.INTENT_PAYMENT_VERIFIED;
    if (i.status === 'DOC_CREATED' || i.status === 'COMPLETED') uxCode = UX_CODES.INTENT_DOC_SYNC_PENDING;

    res.json({
      intent_id:       i.id,
      status:          expired ? 'EXPIRED' : i.status,
      state:           i.status,
      code:            uxCode,
      elapsed_ms,
      file_hash:       i.file_hash,
      amount:          i.amount,
      amount_wei:      i.amount_wei,
      expires_at:      i.expires_at,
      seconds_left:    Math.max(0, Math.floor((new Date(i.expires_at) - Date.now()) / 1000)),
      payment_tx_hash: i.payment_tx_hash
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch intent' }); }
});

router.get('/', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_LIST' }), withAction('DOC_LIST'), async (req, res) => {
  try {
    if (!req.actor) return res.status(401).json({ error: 'Actor header required' });

    const role = Number(req.actor.role);

    // 🛡️ [SURVIVAL] Opportunistic Reconciliation
    // Trigger a fire-and-forget healing pass for orphaned assignments
    if (role === ROLES.ADMIN || role === ROLES.NOTARY) {
        maintenanceService.triggerPassiveReconciliation();
    }

    let query;
    let params = [];

    if (role === ROLES.ADMIN) {
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.name as owner_name, u2.email as owner_email, u2.wallet_address as owner_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               LEFT JOIN users u2 ON d.user_id = u2.id
               WHERE d.is_deleted=false 
               ORDER BY d.created_at DESC`;
    } else if (role === ROLES.NOTARY) {
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.name as owner_name, u2.email as owner_email, u2.wallet_address as owner_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               LEFT JOIN users u2 ON d.user_id = u2.id
               WHERE ((d.submission_state = 'pending' AND d.notary_id IS NULL) OR d.notary_id = $1) 
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
    
    // Sanitize and Map results
    const mapped = r.rows.map(doc => mapToDetailedDoc(doc));
    const sanitized = mapped.map(doc => sanitizeDocument(doc, req.actor));
    res.json(sanitized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ─── GET /api/documents/:id/certificate ───────────────────────────────────────
// Returns structured on-chain proof data for a notarized document.
// Only accessible by the document owner.
router.get('/:id/certificate', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_READ' }), withAction('DOC_READ'), async (req, res) => {
  try {
    const { id } = req.params;
    const actor = req.actor;

    const query = `
      SELECT d.id, d.filename, d.title, d.file_hash, d.submission_state, d.chain_confirmed,
             d.approval_tx_hash, d.tx_hash, d.tx_status, d.notary_id, d.created_at,
             d.status_updated_at, d.updated_at,
             u.wallet_address as notary_wallet, u.name as notary_name
      FROM documents d
      LEFT JOIN users u ON d.notary_id = u.id
      WHERE d.id = $1 AND d.user_id = $2 AND d.is_deleted = false
    `;

    const r = await pool.query(query, [id, actor.id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    const doc = r.rows[0];

    // Only issue a certificate for notarized documents
    const isNotarized = doc.submission_state === 'completed' ||
                        doc.submission_state === 'submitted_to_blockchain' ||
                        doc.chain_confirmed === true;

    if (!isNotarized) {
      return res.status(422).json({ error: 'Document has not been notarized yet' });
    }

    // Fetch contract address from config for the certificate
    const config = await ConfigService.getConfig();
    const chainId = Number(config.chainId);
    const contractAddress = config.contracts.documentRegistry;

    // Derive block explorer URL from chainId
    const explorerBase = chainId === 56
      ? 'https://bscscan.com'
      : 'https://testnet.bscscan.com';

    const approvalTxHash = doc.approval_tx_hash || doc.tx_hash || null;

    res.json({
      document_id: doc.id,
      filename: doc.filename,
      title: doc.title || doc.filename,
      file_hash: doc.file_hash,
      submission_state: doc.submission_state,
      chain_confirmed: doc.chain_confirmed,
      approval_tx_hash: approvalTxHash,
      notarized_at: doc.status_updated_at || doc.updated_at,
      notary_wallet: doc.notary_wallet || null,
      notary_name: doc.notary_name || null,
      contract_address: contractAddress,
      chain_id: chainId,
      block_explorer_url: approvalTxHash ? `${explorerBase}/tx/${approvalTxHash}` : null,
      contract_explorer_url: `${explorerBase}/address/${contractAddress}`
    });

  } catch (err) {
    console.error('[CERTIFICATE_ERROR]', err);
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
});

// GET /api/documents/:id/signature-payload
// Provides the EIP-712 payload for a notary to sign
router.get('/:id/signature-payload', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_SIGNATURE_PAYLOAD' }), withAction('DOC_SIGNATURE_PAYLOAD'), async (req, res) => {
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

    // 🛡️ [ATOMIC_CLAIM] Implement Public Pool "First-to-Claim" logic
    if (doc.notary_id && Number(doc.notary_id) !== notaryId && Number(req.actor.role) !== ROLES.ADMIN) {
      return res.status(403).json({ error: 'This document has already been claimed by another notary.' });
    }

    if (!doc.notary_id) {
        console.log(`[PUBLIC_POOL] Notary ${notaryId} is claiming document ${paramId}`);
        const claimRes = await pool.query(
            "UPDATE documents SET notary_id = $1 WHERE id = $2 AND notary_id IS NULL RETURNING id",
            [notaryId, paramId]
        );
        if (claimRes.rowCount === 0) {
            return res.status(403).json({ error: 'Document was just claimed by another notary. Please refresh your list.' });
        }
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

router.get('/:id', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_READ' }), withAction('DOC_READ'), async (req, res) => {
  try {
    const { id: paramId } = req.params;
    let query;
    let queryParams;

    // Detect if the parameter is a 64-character hex hash (SHA-256)
    const isHash = /^[a-fA-F0-9]{64}$/.test(paramId);

    if (isHash) {
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.name as owner_name, u2.email as owner_email, u2.wallet_address as owner_wallet 
               FROM documents d 
               LEFT JOIN users u ON d.notary_id = u.id 
               LEFT JOIN users u2 ON d.user_id = u2.id
               WHERE d.file_hash=$1 AND d.is_deleted=false`;
      queryParams = [paramId];
    } else {
      if (isNaN(paramId)) return res.status(400).json({ error: 'Invalid document ID or Hash format' });
      query = `SELECT d.*, u.wallet_address as notary_wallet, u2.name as owner_name, u2.email as owner_email, u2.wallet_address as owner_wallet 
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
    // 3. Notaries see documents assigned to them OR unassigned documents (Fallback Queue)
    const isOwner = userId === docUserId;
    const isAssignedNotary = docNotaryId !== null && userId === docNotaryId;
    const isUnassignedNotary = role === ROLES.NOTARY && docNotaryId === null;
    const isPublicPending = role === ROLES.NOTARY && doc.submission_state === 'pending';

    if (role !== ROLES.ADMIN && !isOwner && !isAssignedNotary && !isUnassignedNotary && !isPublicPending) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const mappedDoc = mapToDetailedDoc(doc);
    res.json(sanitizeDocument(mappedDoc, req.actor));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// ─── GET /api/documents/:id/preview ───────────────────────────────────────
// NEW: Cloud-First Preview Endpoint (Phase 2)
router.get('/:id/preview', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_READ' }), withAction('DOC_READ'), async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const docQuery = await pool.query('SELECT * FROM documents WHERE id=$1 AND is_deleted=false', [paramId]);
    
    if (docQuery.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = docQuery.rows[0];

    // Authorization (Same logic as /:id)
    const role = Number(req.actor.role);
    const userId = Number(req.actor.id);
    const isOwner = Number(doc.user_id) === userId;
    const isAssignedNotary = Number(doc.notary_id) === userId;
    const isUnassignedNotary = role === ROLES.NOTARY && !doc.notary_id;
    const isPublicPending = role === ROLES.NOTARY && doc.submission_state === 'pending';

    if (role !== ROLES.ADMIN && !isOwner && !isAssignedNotary && !isUnassignedNotary && !isPublicPending) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!doc.storage_key) return res.status(404).json({ error: 'Cloud source not found' });

    // Hardened Phase 2: Sign with Correct Content-Type for rendering
    const previewUrl = await storageService.getSignedDownloadUrl(doc.storage_key, {
      expiresIn: 120,
      disposition: 'inline',
      contentType: doc.mimetype || 'application/pdf' // Use DB stored type
    });

    console.log(`[DOC_PREVIEW] user=${userId} doc=${req.params.id}`);
    res.json({ preview_url: previewUrl });
  } catch (err) {
    console.error('[PREVIEW] Error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Download Document File
router.get('/:id/file', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_DOWNLOAD' }), withAction('DOC_DOWNLOAD'), async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const r = await pool.query('SELECT * FROM documents WHERE id=$1 AND is_deleted=false', [paramId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = r.rows[0];

    const role = Number(req.actor.role);
    const userId = Number(req.actor.id);
    const isOwner = Number(doc.user_id) === userId;
    const isAssignedNotary = Number(doc.notary_id) === userId;
    const isUnassignedNotary = role === ROLES.NOTARY && !doc.notary_id;
    const isPublicPending = role === ROLES.NOTARY && doc.submission_state === 'pending';

    if (role !== ROLES.ADMIN && !isOwner && !isAssignedNotary && !isUnassignedNotary && !isPublicPending) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!doc.storage_key) return res.status(404).json({ error: 'Cloud storage missing' });

    // Hardened Phase 2: Secure Redirect Boundary
    const signedUrl = await storageService.getSignedDownloadUrl(doc.storage_key, {
      expiresIn: 120,
      disposition: req.query.disposition || 'attachment',
      filename: doc.filename, // Technical immutable name (extension preserved)
      contentType: doc.mimetype // Precise MIME identification
    });

    // Final Safety Guard
    if (!signedUrl.startsWith('https://')) {
      throw new Error('INVALID_SIGNED_URL: Unsecured or malformed redirect intercepted.');
    }

    console.log(`[DOC_DOWNLOAD] user=${userId} doc=${req.params.id}`);
    return res.redirect(signedUrl);
  } catch (err) {
    console.error('[DOWNLOAD] Error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ─── ARBORIZATION: Split Bimodal PATCH into /update and /approve ─────────

// Method A: Metadata Update (OWNER)
router.patch('/:id/update', withDomain('DOCS'), requireUnpaused, requirePrivilege({ capability: 'DOC_UPDATE' }), withAction('DOC_UPDATE'), withMutation(), async (req, res) => {
  return handleDocumentPatch(req, res);
});

// Method B: Notary Approval (NOTARY)
router.post('/:id/approve', withDomain('DOCS'), requireUnpaused, requirePrivilege({ capability: 'DOC_APPROVE' }), withAction('DOC_APPROVE'), withMutation(), async (req, res) => {
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

      // 🛡️ [PHASE 2.5] Ground Truth Guard (Rule 6 Alignment)
      // We rely on identityState === 'ACTIVE' (managed by Admin/Workers) rather than raw tx_status.
      // Blocking on tx_status causes deadlocks if the chain indexer lags.

      const { status, signature, timestamp, document_summary, rejection_reason, txHash } = req.body;

      // 0. IDEMPOTENCY: If already confirmed or submitted, return success rather than error
      if (doc.chain_confirmed || doc.submission_state === 'submitted_to_blockchain') {
        return res.status(200).json({ 
          message: 'Document already finalized or in-flight.', 
          document: sanitizeDocument(doc, actor),
          status: 'success' 
        });
      }

      // 1. RE-VERIFY FILE INTEGRITY (Hash Authority)
      let fileBuffer;
      if (doc.storage_key) {
        try {
          fileBuffer = await storageService.getFileBuffer(doc.storage_key);
        } catch (s3Err) {
          return res.status(502).json({ error: 'Cloud file integrity check failed. Source missing.' });
        }
      } else {
        return res.status(404).json({ error: 'Document source not found in cloud storage' });
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

      // 🔐 ATOMIC CLAIM + LOCK + INTENT (Hardened Phase 3 + Lockdown Phase 1)
      const correlationId = req.correlationId;
      const statusResult = await DocumentStatusService.updateStatus(
        client,
        id,
        doc.submission_state,
        doc.revision,
        doc.submission_state, // Stay in current state (e.g. pending) but take ownership
        {
          idempotency_key: doc.file_hash,
          tx_status: 'initiated',
          processing_started_at: 'NOW()',
          notary_id: actor.id,
          document_summary: document_summary,
          rejection_reason: rejection_reason,
          correlation_id: correlationId,
          status_updated_at: 'NOW()'
        },
        "AND (idempotency_key IS NULL OR tx_status = 'failed' OR tx_status = 'initiated') AND chain_confirmed = false"
      );

      if (statusResult.error === 'STATE_CONFLICT') {
        return res.status(200).json({ 
          message: 'Document already being processed or confirmed.', 
          document: sanitizeDocument(doc, actor),
          status: 'success'
        });
      }

      const previous_state = doc.submission_state;
      const claimedDoc = statusResult.document;
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
        const targetSyncState = onChainData.status === 1n ? 'submitted_to_blockchain' : 'rejected';
        
        const statusResult = await DocumentStatusService.updateStatus(
          client, 
          id, 
          doc.submission_state, 
          doc.revision, 
          targetSyncState, 
          { chain_confirmed: true, tx_status: 'confirmed' }
        );

        if (statusResult.error === 'STATE_CONFLICT') {
            return res.status(409).json({ 
                error: 'STATE_CONFLICT', 
                current_state: statusResult.currentState, 
                revision: statusResult.currentRevision 
            });
        }
        
        return res.json(sanitizeDocument(statusResult.document));
      }

      // 🔐 SIGNATURE RECOVERY & BROADCAST
      const notaryAddressInContext = actor.address || actor.wallet_address;
      const nonceFromContract = await contract.nonces(notaryAddressInContext);
      
      const config = await ConfigService.getConfig();
      const domain = {
        name: "BBSNS_Protocol",
        version: "1",
        chainId: config.chainId,
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
        let recoveredSigner = null;
        if (signature === "DIRECT_TX_CONFIRMED") {
          // If user sent directly, the "signer" is inferred from the actor address
          recoveredSigner = (actor.address || actor.wallet_address);
        } else {
          recoveredSigner = ethers.verifyTypedData(domain, types, message, signature);
        }
        const expectedAddress = (actor.address || actor.wallet_address || "").toLowerCase();
        
        if (!recoveredSigner || recoveredSigner.toLowerCase() !== expectedAddress) {
          await DocumentStatusService.updateStatus(client, id, claimedDoc.submission_state, claimedDoc.revision, claimedDoc.submission_state, { tx_status: 'failed' });
          return res.status(401).json({ error: 'Invalid signature or recovery failure.' });
        }

        const txSendStart = Date.now();
        let txResult;

        if (signature === "DIRECT_TX_CONFIRMED") {
          logger.info('USER_DIRECT_TX_DETECTION', { id, correlation_id: correlationId });
          // If the user already sent it, we just need to wait for confirmation or use the provided hash
          txResult = { txHash: txHash || 'PENDING_USER_TX', simulated: false };
        } else {
          txResult = await sendApprovalTx(
            docHashBytes,
            ownerAddress,
            status,
            signature,
            parseInt(timestamp),
            summaryHash,
            rejectionHash,
            recoveredSigner
          );
        }
        const txSendDuration = Date.now() - txSendStart;

        logger.info('TX_SENT', { 
          id, 
          correlation_id: correlationId, 
          tx_hash: txResult.txHash,
          previous_state: claimedDoc.submission_state,
          new_state: 'submitted_to_blockchain', // Or dbStatus
          duration_ms: txSendDuration
        });

        // Update DB to 'pending' with tx_hash and atomic revision lock
        const statusResult = await DocumentStatusService.updateStatus(
          client,
          id,
          claimedDoc.submission_state,
          claimedDoc.revision,
          dbStatus,
          {
            tx_hash: txResult.txHash,
            tx_status: 'pending',
            needs_cleanup: 'true',
            updated_at: 'NOW()',
            status_updated_at: 'NOW()'
          }
        );

        if (statusResult.error === 'STATE_CONFLICT') {
            logger.error('TX_BROADCAST_CONFLICT', { id, correlation_id: correlationId, tx_hash: txResult.txHash });
            return res.status(409).json({
                error: 'STATE_CONFLICT',
                detail: 'Transaction broadcasted but document state changed simultaneously.',
                current_state: statusResult.currentState,
                revision: statusResult.currentRevision
            });
        }

        const updateRes = statusResult.document;

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

        // 🛡️ [SECURITY] File cleanup is handled exclusively by the reconciliation worker
        // after on-chain confirmation to prevent race conditions and ensure finality.

        return res.json(sanitizeDocument(updateRes));
      } catch (txErr) {
        logger.error('TX_FAILED', { 
          id, 
          correlation_id: correlationId, 
          error_type: ERROR_TYPES.RPC, 
          error_stage: ERROR_STAGES.SEND,
          previous_state: claimedDoc.submission_state,
          new_state: 'failed'
        }, txErr);
        await DocumentStatusService.updateStatus(
          client, 
          id, 
          claimedDoc.submission_state, 
          claimedDoc.revision, 
          claimedDoc.submission_state, 
          { 
            tx_status: 'failed', 
            last_error: JSON.stringify({ type: ERROR_TYPES.RPC, stage: ERROR_STAGES.SEND, message: txErr.message }), 
            updated_at: 'NOW()', 
            status_updated_at: 'NOW()' 
          }
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
    const statusResult = await DocumentStatusService.updateStatus(
      client,
      id,
      doc.submission_state,
      doc.revision,
      doc.submission_state,
      {
        title: 'COALESCE($5, title)',
        updated_at: 'NOW()'
      },
      "",
      [name]
    );

    if (statusResult.error === 'STATE_CONFLICT') {
        return res.status(409).json({ error: 'STATE_CONFLICT', current_state: statusResult.currentState, revision: statusResult.currentRevision });
    }

    const r = { rows: [statusResult.document] };

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
router.put('/:id', requirePrivilege({ capability: 'DOC_APPROVE' }), async (req, res) => {
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

    const statusResult = await DocumentStatusService.updateStatus(
      pool,
      id,
      docQuery.rows[0].submission_state,
      docQuery.rows[0].revision,
      status,
      {
        rejection_reason: '$5',
        notary_id: actor.id,
        updated_at: 'NOW()'
      },
      "",
      [rejection_reason]
    );

    if (statusResult.error === 'STATE_CONFLICT') {
        return res.status(409).json({ error: 'STATE_CONFLICT', current_state: statusResult.currentState, revision: statusResult.currentRevision });
    }

    const result = { rows: [statusResult.document] };

    res.json(sanitizeDocument(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.delete('/:id', withDomain('DOCS'), requirePrivilege({ capability: 'DOC_DELETE' }), withAction('DOC_DELETE'), withMutation(), async (req, res) => {
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

    await DocumentStatusService.updateStatus(pool, id, doc.submission_state, doc.revision, doc.submission_state, { is_deleted: true });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
