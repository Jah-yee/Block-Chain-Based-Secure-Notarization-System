const { ethers } = require("ethers");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function grantTokenRoles() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const privateKey = process.env.BNB_SYSTEM_PRIVATE_KEY;
    const wallet = new ethers.Wallet(privateKey, provider);

    // Hardcoded active addresses for security and clarity
    const ntkAddress = "0x505388A24BA31F64A46dC10a7923EA4892c0B0C7";
    const ntkrAddress = "0x5E03361Fb7221b71E064510eE0E84f7c1895195F";
    const registryAddress = "0xdE08bb23e313C6A7C10F61303bE2ac6DE6a00d2d";

    console.log(`\n🚀 GRANTING TOKEN ROLES (HARDCODED)`);
    console.log(`- NTK: ${ntkAddress}`);
    console.log(`- NTKR: ${ntkrAddress}`);
    console.log(`- DocumentRegistry: ${registryAddress}`);
    console.log(`- Relayer/Admin: ${wallet.address}`);

    const abi = [
        "function grantRole(bytes32 role, address account) external",
        "function RELAYER_ROLE() view returns (bytes32)",
        "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
        "function hasRole(bytes32 role, address account) view returns (bool)"
    ];

    try {
        const ntk = new ethers.Contract(ntkAddress, abi, wallet);
        const ntkr = new ethers.Contract(ntkrAddress, abi, wallet);

        const ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

        console.log(`\n[NTK] Checking permissions...`);
        const isAdminNTK = await ntk.hasRole(ADMIN_ROLE, wallet.address);
        console.log(`- Relayer is Admin on NTK: ${isAdminNTK}`);

        if (isAdminNTK) {
            console.log(`- Granting RELAYER_ROLE to DocumentRegistry...`);
            const tx1 = await ntk.grantRole(RELAYER_ROLE, registryAddress);
            await tx1.wait();
            console.log(`✅ Role granted on NTK: ${tx1.hash}`);
        } else {
            console.error(`❌ Relayer is NOT admin on NTK. Content grant impossible.`);
        }

        console.log(`\n[NTKR] Checking permissions...`);
        const isAdminNTKR = await ntkr.hasRole(ADMIN_ROLE, wallet.address);
        console.log(`- Relayer is Admin on NTKR: ${isAdminNTKR}`);

        if (isAdminNTKR) {
            console.log(`- Granting RELAYER_ROLE to Relayer...`);
            const tx2 = await ntkr.grantRole(RELAYER_ROLE, wallet.address);
            await tx2.wait();
            console.log(`✅ Role granted on NTKR: ${tx2.hash}`);
        }

    } catch (err) {
        console.error(`Grant failed: ${err.message}`);
    }
}

grantTokenRoles();
