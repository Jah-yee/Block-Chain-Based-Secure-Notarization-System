const pool = require('../db/index');
const crypto = require('crypto');
const { ethers } = require('ethers');
const ConfigService = require('../services/config.service');
const { Logger } = require('../services/logger.service');
const logger = new Logger('SCAVENGER_WORKER');

const { runWithSystemContext } = require('../middleware/actor');
const WorkerRegistry = require('../services/worker-registry.service');

const NODE_ID = crypto.randomUUID();
const LEASE_DURATION_MS = 60000; // 1 minute

// ABI for NTKR event verification
const NTKR_ABI = ['event BurnedForUpload(address indexed user, uint256 amount, bytes32 intentId)'];

function uuidToBytes32(uuid) {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padStart(64, '0');
}

/**
 * 🛡️ Scavenger Service
 * Responsibility: Rescuing interrupted document creations.
 */
async function runScavenger() {
  await runWithSystemContext('SCAVENGER_WORKER', 'Rescuing interrupted document creations', async () => {
    WorkerRegistry.heartbeat('scavenger', 'OK');
    const client = await pool.connect();
    try {
      // ⚔️ [TRANSACTIONAL_CLAIM] 
      await client.query('BEGIN');

      const stuckRes = await client.query(
        `SELECT id, status, payment_tx_hash, amount_wei, wallet_address 
         FROM upload_intents 
         WHERE status IN ('PAYMENT_VERIFIED', 'DOC_CREATED')
           AND (processing_lock_until IS NULL OR processing_lock_until < NOW())
         LIMIT 10 FOR UPDATE SKIP LOCKED`
      );

      if (stuckRes.rows.length === 0) {
        await cleanupExpiredSessions(client);
        await client.query('COMMIT');
        return;
      }

      logger.info('SCAVENGER_START', { count: stuckRes.rows.length });

      // Claim them immediately within the transaction
      const lockUntil = new Date(Date.now() + LEASE_DURATION_MS);
      for (const intent of stuckRes.rows) {
          await client.query(
              "UPDATE upload_intents SET processing_lock_until=$1, processing_node_id=$2 WHERE id=$3",
              [lockUntil, NODE_ID, intent.id]
          );
      }
      await client.query('COMMIT');

      // 2. Process claims one by one
      for (const intent of stuckRes.rows) {
        const pClient = await pool.connect();
        try {
            await pClient.query('BEGIN');
            await processStuckIntent(pClient, intent);
            await pClient.query('COMMIT');
        } catch (err) {
            await pClient.query('ROLLBACK').catch(() => {});
            const { ERROR_TYPES, ERROR_STAGES } = require('../services/logger.service');
            logger.error('SCAVENGER_INTENT_FAIL', { 
              intent_id: intent.id, 
              error_type: ERROR_TYPES.DB, 
              error_stage: ERROR_STAGES.RECOVERY 
            }, err);
        } finally {
            pClient.release();
        }
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const { ERROR_TYPES, ERROR_STAGES } = require('../services/logger.service');
      logger.error('SCAVENGER_CRITICAL', { 
          error_type: ERROR_TYPES.DB, 
          error_stage: ERROR_STAGES.RECOVERY 
      }, err);
      WorkerRegistry.heartbeat('scavenger', 'FAIL', { error: err.message });
    } finally {
      client.release();
    }
  });
}

async function processStuckIntent(client, intent) {
  logger.info('RECUING_INTENT', { id: intent.id, status: intent.status });

  const lockUntil = new Date(Date.now() + LEASE_DURATION_MS);
  await client.query(
    "UPDATE upload_intents SET processing_lock_until=$1, processing_node_id=$2 WHERE id=$3",
    [lockUntil, NODE_ID, intent.id]
  );

  if (intent.status === 'PAYMENT_VERIFIED') {
    await attemptDocCreation(client, intent);
  } else if (intent.status === 'DOC_CREATED') {
    await finalizeIntent(client, intent);
  }
}

async function attemptDocCreation(client, intent) {
  const fullRes = await client.query("SELECT * FROM upload_intents WHERE id=$1", [intent.id]);
  const i = fullRes.rows[0];

  const docRes = await client.query(
    `INSERT INTO documents
       (user_id, filename, title, mimetype, storage_key, file_hash, submission_state, ntkr_sent, payment_tx_hash, storage_state, created_at, updated_at, is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,NOW(),NOW(),false) 
     ON CONFLICT (payment_tx_hash) DO NOTHING
     RETURNING id`,
    [i.user_id, i.filename, i.title, i.mimetype, i.storage_key, i.file_hash, i.amount, i.payment_tx_hash, 'STORED']
  );
  
  const docId = docRes.rows[0]?.id;
  await client.query("UPDATE upload_intents SET status='DOC_CREATED', processing_lock_until=NULL, processing_node_id=NULL WHERE id=$1", [i.id]);
  
  if (docId) {
      logger.info('RECOVERY_DOC_CREATED', { intent_id: i.id, doc_id: docId });
      await finalizeIntent(client, i, docId);
  } else {
      const existingDoc = await client.query("SELECT id FROM documents WHERE payment_tx_hash=$1", [i.payment_tx_hash]);
      await finalizeIntent(client, i, existingDoc.rows[0].id);
  }
}

async function finalizeIntent(client, intent, docId) {
  let targetDocId = docId;
  if (!targetDocId) {
    const res = await client.query("SELECT id FROM documents WHERE payment_tx_hash=$1", [intent.payment_tx_hash]);
    targetDocId = res.rows[0]?.id;
  }

  await client.query(
    `INSERT INTO ntkr_transactions (user_id, document_id, tx_type, amount, tx_hash, status, note, created_at)
     VALUES ($1,$2,'burn',$3,$4,'success','verified by scavenger',NOW())
     ON CONFLICT DO NOTHING`,
    [intent.user_id, targetDocId, intent.amount, intent.payment_tx_hash]
  );

  await client.query("UPDATE upload_intents SET status='COMPLETED', processing_lock_until=NULL, processing_node_id=NULL WHERE id=$1", [intent.id]);
  logger.info('RECOVERY_COMPLETED', { intent_id: intent.id });
}

/**
 * 🧹 Remote Auth Hygiene
 * Responsibility: Pruning dead sessions to prevent index bloat.
 */
async function cleanupExpiredSessions(client) {
    try {
        const res = await client.query(
            "DELETE FROM remote_auth_sessions WHERE expires_at < NOW() - INTERVAL '24 hours'"
        );
        if (res.rowCount > 0) {
            logger.info('SESSION_HYGIENE_SUCCESS', { deleted_count: res.rowCount });
        }
    } catch (err) {
        logger.error('SESSION_HYGIENE_FAIL', { error: err.message });
    }
}

module.exports = { runScavenger };
