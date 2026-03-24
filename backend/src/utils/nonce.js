const crypto = require('crypto');

function generateNonce() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateNonce,
};
