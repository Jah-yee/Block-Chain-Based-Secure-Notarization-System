const { ethers } = require('ethers');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

async function run() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
    const wallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);
    const ntkAddress = process.env.NTK_CONTRACT_ADDRESS;
    
    console.log(`Relayer Wallet: ${wallet.address}`);
    console.log(`NTK: ${ntkAddress}`);

    const ntkAbi = [
      "function mintDailyNTK(address user) external",
      "function balanceOf(address) view returns (uint256)"
    ];
    const ntk = new ethers.Contract(ntkAddress, ntkAbi, wallet);
    
    console.log(`Minting NTK to relayer...`);
    const tx = await ntk.mintDailyNTK(wallet.address);
    await tx.wait();
    console.log('✅ NTK Minted to Relayer.');

    const balance = await ntk.balanceOf(wallet.address);
    console.log(`New Balance: ${ethers.formatUnits(balance, 18)} NTK`);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
  }
}

run();
