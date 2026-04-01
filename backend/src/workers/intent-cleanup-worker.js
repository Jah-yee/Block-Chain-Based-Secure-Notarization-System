const pool = require('../db/index');
const fs   = require('fs');
const lockService = require('../services/lock.service');
const storageService = require('../services/storage.service');

async function runIntentCleanup() {
  const lockId = 1004; // INTENT_CLEANUP
  if (!(await lockService.tryLock(lockId))) {
    return;
  }

  try {
    // 1. Find all intents that have expired or failed permanently
    const targets = await pool.query(
      `SELECT id, storage_key, status FROM upload_intents
       WHERE (status = 'AWAITING_PAYMENT' AND expires_at < NOW())
          OR status = 'FAILED_FINAL'`
    );

    if (targets.rows.length === 0) return;

    for (const intent of targets.rows) {
      // 🛡️ Physical Cleanup (PoNR protection: we only delete if not in recovery pipe)
      if (intent.storage_key) {
        try {
          if (intent.storage_key.startsWith('intents/')) {
            await storageService.deleteFile(intent.storage_key);
          } else {
            // Local path cleanup
            const fs = require('fs');
            const path = require('path');
            let localPath = intent.storage_key;
            if (!path.isAbsolute(localPath)) localPath = path.join(__dirname, '../../', localPath);
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          }
        } catch (storageErr) {
          console.error(`[CLEANUP] Storage delete failed for intent ${intent.id}: ${storageErr.message}`);
        }
      }

      // 🛡️ State Terminal Transition
      if (intent.status === 'AWAITING_PAYMENT') {
        await pool.query("UPDATE upload_intents SET status = 'EXPIRED' WHERE id = $1", [intent.id]);
      }
      
      // If was FAILED_FINAL, we don't change state, just cleaned the file.
      // But we should null the storage_key to show it's gone
      await pool.query("UPDATE upload_intents SET storage_key = NULL WHERE id = $1", [intent.id]);
    }

  } catch (err) {
    console.error('[INTENT_CLEANUP] Worker error:', err.message);
  } finally {
    await lockService.unlock(lockId);
  }
}

module.exports = { runIntentCleanup };
