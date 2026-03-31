const { ethers } = require('ethers');

const rpc = "https://data-seed-prebsc-1-s1.binance.org:8545";
const provider = new ethers.JsonRpcProvider(rpc);

const set1 = {
    name: "Set 1 (Backend)",
    contracts: {
        notaryRegistry: "0x1A820f5975dc41c904bF221df342191694Da1f98",
        documentRegistry: "0x8fdaCefB6002F56A59cef36dA94e2ee9d55D7fe6",
        ntkr: "0xD59a331bC1e2439b686d75cffBdDE419a51eeFCE",
        ntk: "0x0d92A3De88202C929714df9cB24395CF4C15ba2e",
        genesisActivation: "0x11DAA2d0ffCCE08B138BB345e3CdBc7d7483686d",
        genesisNft: "0x66a309BFeEeC137411d2B0BaA890c79b864F8886",
        multisig: "0xED1873d82766D61D3A5564A62b71C6DCc1403366"
    }
};

const set2 = {
    name: "Set 2 (Desktop)",
    contracts: {
        notaryRegistry: "0x26485F8140b90599C59a9664D6606FDBEeb63cdB",
        documentRegistry: "0xb1506746Ce63d054471D79a4765dF97b5e3E716A",
        ntk: "0x446F3F7cAcD0d339A9944A48f32841c923AA8Dfb",
        genesisActivation: "0x193a05372E0582ff491CCE8805110e2a38ff1243",
        genesisNft: "0x0497C5132EB4EC4fbf9dDf88Dc5504042512ff08"
    }
};

const ABIS = [
    "function documentRegistry() view returns (address)",
    "function notaryRegistry() view returns (address)",
    "function ntkToken() view returns (address)",
    "function ntkrToken() view returns (address)",
    "function genesisActivation() view returns (address)",
    "function version() view returns (string)",
    "function getRoleMemberCount(bytes32 role) view returns (uint256)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)"
];

async function deepAudit(set) {
    console.log(`\n🔍 DEEP AUDIT: ${set.name}`);
    const notary = new ethers.Contract(set.contracts.notaryRegistry, ABIS, provider);
    
    try {
        // Try to get internal pointers
        const docPointer = await notary.documentRegistry().catch(() => "N/A");
        const ntkPointer = await notary.ntkToken().catch(() => "N/A");
        const ntkrPointer = await notary.ntkrToken().catch(() => "N/A");
        const version = await notary.version().catch(() => "N/A");

        console.log(`   Notary Address: ${set.contracts.notaryRegistry}`);
        console.log(`   Internal Link -> DocumentRegistry: ${docPointer}`);
        console.log(`   Internal Link -> NTK Token      : ${ntkPointer}`);
        console.log(`   Internal Link -> NTKR Token     : ${ntkrPointer}`);
        console.log(`   Contract Version: ${version}`);

        if (docPointer !== "N/A") {
            const expectedDoc = set.contracts.documentRegistry || "Unknown";
            const match = docPointer.toLowerCase() === expectedDoc.toLowerCase();
            console.log(`   [VERDICT] Linkage Match: ${match ? '✅ YES' : '❌ NO'}`);
        }

        // Check for activity (Admin count)
        const adminRole = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const adminCount = await notary.getRoleMemberCount(adminRole).catch(() => "N/A");
        console.log(`   Admin Count: ${adminCount}`);

    } catch (e) {
        console.log(`   🛑 Audit Failure: ${e.message}`);
    }
}

async function run() {
    await deepAudit(set1);
    await deepAudit(set2);
}

run();
