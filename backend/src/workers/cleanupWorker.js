const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

const pool = require('../db/index');
const fs = require('fs');
const storageService = require('../services/storage.service');
const { Logger } = require('../services/logger.service');
const logger = new Logger('CLEANUP_WORKER');

async function runCleanup() {
    let client;
    try {
        client = await pool.connect();
        
        // 1. Concurrency Control: Advisory Lock (9999)
        const lockRes = await client.query('SELECT pg_try_advisory_lock(9999)');
        const hasLock = lockRes.rows[0].pg_try_advisory_lock;

        if (!hasLock) {
            logger.info('SKIP', { reason: 'Another instance running (lock 9999)' });
            return;
        }

        try {
            // A) EXPIRED INTENTS (Batch Limit 50)
            const expiredIntents = await client.query(`
                SELECT id, storage_key, storage_state 
                FROM upload_intents 
                WHERE expires_at < NOW() 
                AND status NOT IN ('confirmed', 'expired') 
                AND cleanup_attempts < 5 
                LIMIT 50
            `);

            for (const intent of expiredIntents.rows) {
                try {
                    if (intent.storage_key) {
                        if (intent.storage_state === 'UPLOADED') {
                            await storageService.deleteFile(intent.storage_key);
                        } else {
                            let localPath = intent.storage_key;
                            if (!path.isAbsolute(localPath)) localPath = path.join(__dirname, '../../', localPath);
                            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                        }
                    }
                    await client.query("UPDATE upload_intents SET status = 'expired', cleanup_attempts = cleanup_attempts + 1 WHERE id = $1", [intent.id]);
                    logger.info('CLEANUP_SUCCESS', { type: 'intent', id: intent.id });
                } catch (err) {
                    await client.query("UPDATE upload_intents SET cleanup_attempts = cleanup_attempts + 1 WHERE id = $1", [intent.id]);
                    logger.error('CLEANUP_FAILED', { type: 'intent', id: intent.id, error: err.message });
                }
            }

            // B) FINALIZED DOCUMENTS (Batch Limit 50)
            const finalizedDocs = await client.query(`
                SELECT id, storage_key, storage_state 
                FROM documents 
                WHERE needs_cleanup = true 
                AND chain_confirmed = true 
                AND submission_state IN ('submitted_to_blockchain', 'rejected') 
                AND cleanup_attempts < 5 
                LIMIT 50
            `);

            for (const doc of finalizedDocs.rows) {
                try {
                    if (doc.storage_key) {
                        if (doc.storage_state === 'UPLOADED' || doc.storage_key.startsWith('intents/')) {
                            await storageService.deleteFile(doc.storage_key);
                        } else {
                            let localPath = doc.storage_key;
                            if (!path.isAbsolute(localPath)) localPath = path.join(__dirname, '../../', localPath);
                            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                        }
                    }
                    await client.query("UPDATE documents SET needs_cleanup = false, cleanup_attempts = cleanup_attempts + 1 WHERE id = $1", [doc.id]);
                    logger.info('CLEANUP_SUCCESS', { type: 'document', id: doc.id });
                } catch (err) {
                    await client.query("UPDATE documents SET cleanup_attempts = cleanup_attempts + 1 WHERE id = $1", [doc.id]);
                    logger.error('CLEANUP_FAILED', { type: 'document', id: doc.id, error: err.message });
                }
            }

        } finally {
            await client.query('SELECT pg_advisory_unlock(9999)');
        }
    } catch (err) {
        logger.error('CRITICAL_WORKER_ERROR', { error: err.message });
    } finally {
        if (client) client.release();
        process.exit(0);
    }
}

runCleanup();
