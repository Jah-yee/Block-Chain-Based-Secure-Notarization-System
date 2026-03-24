const pool = require('../db/index');
const jwt = require('jsonwebtoken');

async function verifyNonce(wallet_address, nonce) {
  if (!wallet_address || !nonce) {
    throw new Error('wallet_address and nonce are required');
  }

  const result = await pool.query(
    'SELECT * FROM wallet_nonces WHERE wallet_address = $1 AND nonce = $2',
    [wallet_address, nonce]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid nonce');
  }

  const { expiry, used_at } = result.rows[0];

  if (used_at) {
    throw new Error('Nonce already used');
  }

  if (new Date() > new Date(expiry)) {
    throw new Error('Nonce expired');
  }

  // Mark as used (single-use)
  await pool.query(
    'UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2',
    [wallet_address, nonce]
  );

  return true;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  let token = cookieToken;

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    return res.status(401).json({ error: 'Authorization token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Store full decoded object (id, wallet, role)
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  verifyNonce,
  authMiddleware,
};
