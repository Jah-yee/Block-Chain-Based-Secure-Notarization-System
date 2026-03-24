const { ethers } = require("ethers");
require('dotenv').config();

async function debugABI() {
    const ntkAddress = "0x56f1be37bcf831Cb3b2a2Ff048346C1B76B2ABdb";
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);

    const abi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "function owner() view returns (address)",
        "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
        "function hasRole(bytes32, address) view returns (bool)"
    ];

    const contract = new ethers.Contract(ntkAddress, abi, provider);

    const calls = [
        { name: "name", fn: () => contract.name() },
        { name: "symbol", fn: () => contract.symbol() },
        { name: "balanceOf(0x0225...)", fn: () => contract.balanceOf("0x02252Db03aF7CD8C8d3eC6CFd3AE5f6dab69ACd0") },
        { name: "owner", fn: () => contract.owner() },
        { name: "DEFAULT_ADMIN_ROLE", fn: () => contract.DEFAULT_ADMIN_ROLE() }
    ];

    for (const call of calls) {
        try {
            const res = await call.fn();
            console.log(`${call.name}: SUCCESS (${res})`);
        } catch (e) {
            console.log(`${call.name}: FAILED (${e.code || e.reason || e.message})`);
        }
    }
}

debugABI();
