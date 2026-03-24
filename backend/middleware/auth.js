const pool = require('../src/db/index.js');

async function verifyNonce(walletAddress, nonce) {
  await pool.query(
    'UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2',
    [walletAddress, nonce]
  );
}

module.exports = {
  verifyNonce,
};
