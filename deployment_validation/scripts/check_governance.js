const { ethers } = require("ethers");
require("dotenv").config();

async function checkGovernanceParams() {
    const provider = new ethers.JsonRpcProvider(process.env.VITE_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const multisigAddress = process.env.MULTISIG_CONTRACT_ADDRESS;
    const abi = [
        "function timelockDelay() view returns (uint256)",
        "function threshold() view returns (uint256)",
        "function getSigners() view returns (address[])",
        "function getTransactionCount() view returns (uint256)"
    ];

    const contract = new ethers.Contract(multisigAddress, abi, provider);

    const delay = await contract.timelockDelay();
    const threshold = await contract.threshold();
    const signers = await contract.getSigners();
    const txCount = await contract.getTransactionCount();

    const output = `
--- Multi-Sig Governance Check ---
Contract:  ${multisigAddress}
Timelock:  ${delay.toString()} seconds (${(Number(delay) / 3600).toFixed(2)} hours)
Threshold: ${threshold.toString()} / ${signers.length}
Signers:   ${JSON.stringify(signers)}
Tx Count:  ${txCount.toString()}
----------------------------------
`;
    console.log(output);
}

checkGovernanceParams().catch(console.error);
