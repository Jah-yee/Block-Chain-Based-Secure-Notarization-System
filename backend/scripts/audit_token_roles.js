const { ethers } = require("ethers");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function auditTokenRoles() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Hardcoded active addresses to bypass ENV pollution for verification
    const ntkAddress = "0x505388A24BA31F64A46dC10a7923EA4892c0B0C7";
    const ntkrAddress = "0x5E03361Fb7221b71E064510eE0E84f7c1895195F";
    const registryAddress = "0xdE08bb23e313C6A7C10F61303bE2ac6DE6a00d2d";

    // Derived Relayer Address
    const privateKey = process.env.BNB_SYSTEM_PRIVATE_KEY;
    const relayerAddress = new ethers.Wallet(privateKey).address;

    console.log(`\n🔍 FINAL AUDIT (HARDCODED)`);
    console.log(`- NTK: ${ntkAddress}`);
    console.log(`- NTKR: ${ntkrAddress}`);
    console.log(`- DocumentRegistry: ${registryAddress}`);
    console.log(`- Relayer: ${relayerAddress}`);

    const roleAbi = [
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function RELAYER_ROLE() view returns (bytes32)"
    ];

    try {
        const ntk = new ethers.Contract(ntkAddress, roleAbi, provider);
        const ntkr = new ethers.Contract(ntkrAddress, roleAbi, provider);
        const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

        console.log(`\n[NTK] Checking Roles...`);
        const relayerHasRoleNTK = await ntk.hasRole(RELAYER_ROLE, relayerAddress);
        console.log(`- Relayer has RELAYER_ROLE on NTK: ${relayerHasRoleNTK}`);

        const registryHasRoleNTK = await ntk.hasRole(RELAYER_ROLE, registryAddress);
        console.log(`- DocumentRegistry has RELAYER_ROLE on NTK: ${registryHasRoleNTK}`);

        console.log(`\n[NTKR] Checking Roles...`);
        const relayerHasRoleNTKR = await ntkr.hasRole(RELAYER_ROLE, relayerAddress);
        console.log(`- Relayer has RELAYER_ROLE on NTKR: ${relayerHasRoleNTKR}`);

        if (relayerHasRoleNTK && registryHasRoleNTK && relayerHasRoleNTKR) {
            console.log(`\n✅ ALL PERMISSIONS VERIFIED ON-CHAIN`);
        } else {
            console.error(`\n❌ PERMISSION GAPS DETECTED`);
        }

    } catch (err) {
        console.error(`Audit failed: ${err.message}`);
    }
}

auditTokenRoles();
