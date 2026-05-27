const { ethers } = require('c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/node_modules/ethers');

async function check() {
    try {
        const provider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545");
        
        const systemPrivateKey = "0xd61ee2917dcb6bd3e6be9ce81788ecff0579913f9913ee6152ae9467fbba67d6";
        const systemWallet = new ethers.Wallet(systemPrivateKey, provider);
        console.log(`Backend System Wallet Address: ${systemWallet.address}`);

        const registryAddress = "0x5831dF2b77Fd728fea9748EBa39C907B39f597c7";
        console.log(`NotaryRegistry Contract Address: ${registryAddress}`);

        const abi = [
            "function getUserRole(address) view returns (uint8)",
            "function relayer() view returns (address)",
            "function multiSig() view returns (address)"
        ];

        const contract = new ethers.Contract(registryAddress, abi, provider);

        const systemRole = await contract.getUserRole(systemWallet.address);
        const relayerAddr = await contract.relayer();
        const multiSigAddr = await contract.multiSig();

        console.log(`System Wallet Role: ${Number(systemRole)}`);
        console.log(`Relayer Address: ${relayerAddr}`);
        console.log(`MultiSig Address: ${multiSigAddr}`);

    } catch (e) {
        console.error('Check failed:', e);
    }
}

check();
