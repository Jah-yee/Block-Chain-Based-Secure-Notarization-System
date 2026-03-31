const { ethers } = require('ethers');
const { connectBNB } = require('../blockchain/connection');
const NonceManager = require("../blockchain/nonce-manager");

const sendApprovalTx = async (docHash, ownerAddress, status, signature, timestamp, summaryHash, rejectionReasonHash, notaryAddress) => {
  if (process.env.BLOCKCHAIN_MODE === "simulate") {
    console.log(`[BLOCKCHAIN_SIM] Recording docHash: ${docHash} with status: ${status}`);
    return { txHash: `0xSIM-${Date.now()}-${Math.round(Math.random() * 1000)}`, simulated: true };
  }

  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    try {
      const { contract: registry, signer } = await connectBNB();
      const nm = new NonceManager(signer);

      const statusUint = status === 'rejected' ? 2 : 1;

      // 1. Get Protocol Nonce (Internal Notary Nonce)
      // We must fetch the nonce for the NOTARY who signed the payload, not the relayer.
      const protocolNonce = await registry.nonces(notaryAddress);
      
      // 2. Get Gas Nonce (Tx sequence)
      const gasNonce = await nm.getNonce();

      console.log(`[EIP712_RECOVERY_TRACE]`);
      console.log(`  Notary: ${notaryAddress}`);
      console.log(`  Protocol Nonce: ${protocolNonce}`);
      console.log(`  Gas Nonce: ${gasNonce}`);
      console.log(`🚀 Sending recordAction (Attempt: ${attempt + 1})...`);

      // 3. Estimate Gas with Buffer
      const feeData = await signer.provider.getFeeData();
      const gasPrice = (feeData.gasPrice * 120n) / 100n; // 20% buffer

      const tx = await registry.recordAction(
        docHash,
        ownerAddress,
        statusUint,
        summaryHash || ethers.ZeroHash,
        rejectionReasonHash || ethers.ZeroHash,
        timestamp || Math.floor(Date.now() / 1000),
        protocolNonce,
        signature,
        {
          nonce: gasNonce,
          gasPrice
        }
      );

      // 4. Increment Gas Nonce ONLY if broadcast succeeds
      await nm.incrementNonce();

      console.log(`✅ Action submitted on-chain: ${tx.hash}`);
      return { txHash: tx.hash, simulated: false };

    } catch (error) {
      attempt++;
      console.error(`⚠️ Blockchain Transaction Attempt ${attempt} Failed:`, error.message);

      if (error.message.includes("nonce too low") || error.message.includes("already known")) {
        // Force sync with node if nonce is out of sync
        const { signer } = await connectBNB();
        await (new NonceManager(signer)).syncNonceWithNode();
      }

      if (attempt >= maxAttempts) throw error;
      await new Promise(r => setTimeout(r, 2000 * attempt)); // Exponential backoff
    }
  }
};

const burnNTKR = null; // REMOVED: NTKR burn is now user-signed on-chain via NTKR.burnForUpload()
// Relayer only handles DocumentRegistry.recordAction() calls.

module.exports = { sendApprovalTx };
