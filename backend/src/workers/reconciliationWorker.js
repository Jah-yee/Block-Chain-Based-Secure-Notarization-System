const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

const { reconcile } = require('./reconciliation');
const pool = require('../db/index');
const { Logger } = require('../services/logger.service');
const logger = new Logger('RECONCILIATION_WORKER');

async function runReconciliation() {
    let client;
    try {
        client = await pool.connect();
        
        // 1. Concurrency Control: Advisory Lock (1004)
        const lockRes = await client.query('SELECT pg_try_advisory_lock(1004)');
        const hasLock = lockRes.rows[0].pg_try_advisory_lock;

        if (!hasLock) {
            logger.info('SKIP', { reason: 'Another instance running (lock 1004)' });
            return;
        }

        try {
            logger.info('RECONCILIATION_STARTED');
            await reconcile();
            logger.info('RECONCILIATION_SUCCESS');
        } catch (err) {
            logger.error('RECONCILIATION_FAILED', { error: err.message });
        } finally {
            await client.query('SELECT pg_advisory_unlock(1004)');
        }
    } catch (err) {
        logger.error('CRITICAL_RECONCILIATION_WORKER_ERROR', { error: err.message });
    } finally {
        if (client) client.release();
        process.exit(0);
    }
}

runReconciliation();
