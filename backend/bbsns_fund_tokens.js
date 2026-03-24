const { ethers } = require('ethers');
const path = require('path');
const dotenv = require('dotenv');

// FORCE OVERRIDE to prevent stale env vars from shell
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

async function run() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
    const wallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);
    const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
    const ntkAddress = process.env.NTK_CONTRACT_ADDRESS;
    
    console.log(`--- ENV CHECK ---`);
    console.log(`Wallet: ${wallet.address}`);
    console.log(`NTKR (from env): ${ntkrAddress}`);
    console.log(`NTK  (from env): ${ntkAddress}`);
    console.log(`--- DB CHECK ---`);

    if (!ntkrAddress || !ntkAddress) {
        throw new Error("Missing contract addresses in .env");
    }

    const ntkrAbi = [
      "function mintNTKR(address user, uint256 amount) external",
      "function balanceOf(address) view returns (uint256)",
      "function RELAYER_ROLE() view returns (bytes32)",
      "function hasRole(bytes32, address) view returns (bool)"
    ];
    const ntkr = new ethers.Contract(ntkrAddress, ntkrAbi, wallet);
    
    // Diagnostic: check if we can even call a view function
    try {
        const symbol = await ntkr.getAddress();
        console.log(`Connected to NTKR at: ${symbol}`);
        const role = await ntkr.RELAYER_ROLE();
        const isRelayer = await ntkr.hasRole(role, wallet.address);
        console.log(`Is Relayer on NTKR? ${isRelayer}`);
    } catch (e) {
        console.error(`❌ Failed to connect to contract at ${ntkrAddress}: ${e.message}`);
        throw e;
    }

    console.log('Minting 50 NTKR...');
    const tx1 = await ntkr.mintNTKR(wallet.address, ethers.parseEther("50"));
    console.log(`TX sent: ${tx1.hash}`);
    await tx1.wait();
    console.log('✅ NTKR Minted.');

    const ntkAbi = [
      "function mintDailyNTK(address user) external",
      "function balanceOf(address) view returns (uint256)"
    ];
    const ntk = new ethers.Contract(ntkAddress, ntkAbi, wallet);
    const notaryWallet = '0x1000000000000000000000000000000000000001';
    
    console.log(`Minting NTK to ${notaryWallet}...`);
    const tx2 = await ntk.mintDailyNTK(notaryWallet);
    console.log(`TX sent: ${tx2.hash}`);
    await tx2.wait();
    console.log('✅ NTK Minted.');

  } catch (err) {
    console.error('❌ ERROR:');
    if (err.data) console.error('Data:', err.data);
    if (err.reason) console.error('Reason:', err.reason);
    console.error(err);
  }
}

run();
