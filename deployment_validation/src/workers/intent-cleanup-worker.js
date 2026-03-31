const pool = require('../db/index');
const fs   = require('fs');
const lockService = require('../services/lock.service');
const storageService = require('../services/storage.service');

async function runIntentCleanup() {
  const lockId = 1004; // INTENT_CLEANUP
  if (!(await lockService.tryLock(lockId))) {
    console.log('[INTENT_CLEANUP] Skip: Another instance is cleaning up.');
    return;
  }

  try {
    // Find all intents that have been awaiting payment past their expiry
    const expired = await pool.query(
      `SELECT id, filepath FROM upload_intents
       WHERE status = 'awaiting_payment' AND expires_at < NOW()`
    );

    if (expired.rows.length === 0) return;

    console.log(`[INTENT_CLEANUP] Expiring ${expired.rows.length} stale upload intent(s)...`);

    for (const intent of expired.rows) {
      // 1. Delete cloud file if it exists
      if (intent.storage_key) {
        try {
          await storageService.deleteFile(intent.storage_key);
        } catch (s3Err) {
          console.error(`[INTENT_CLEANUP] S3 delete failed for intent ${intent.id}: ${s3Err.message}`);
        }
      }

      // 2. Delete local temp file if it exists
      try {
        if (intent.filepath && fs.existsSync(intent.filepath)) {
          fs.unlinkSync(intent.filepath);
          console.log(`[INTENT_CLEANUP] Deleted temp file: ${intent.filepath}`);
        }
      } catch (fileErr) {
        console.error(`[INTENT_CLEANUP] Local delete failed for intent ${intent.id}: ${fileErr.message}`);
      }

      // 2. Mark intent as expired
      await pool.query(
        `UPDATE upload_intents SET status = 'expired' WHERE id = $1`,
        [intent.id]
      );
    }

    console.log(`[INTENT_CLEANUP] Done — expired ${expired.rows.length} intent(s)`);
  } catch (err) {
    console.error('[INTENT_CLEANUP] Worker error:', err.message);
  } finally {
    await lockService.unlock(1004);
  }
}

module.exports = { runIntentCleanup };
