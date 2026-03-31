const { ethers } = require('ethers');

const rpc = "https://data-seed-prebsc-1-s1.binance.org:8545";
const provider = new ethers.JsonRpcProvider(rpc);

// Shared ABI for common functions
const COMMON_ABI = [
    "function owner() view returns (address)",
    "function admin() view returns (address)",
    "function getRoleAdmin(bytes32 role) view returns (address)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)"
];

const set1 = {
    name: "Set 1 (Backend)",
    contracts: {
        notary: "0x1A820f5975dc41c904bF221df342191694Da1f98",
        document: "0x8fdaCefB6002F56A59cef36dA94e2ee9d55D7fe6",
        ntkr: "0xD59a331bC1e2439b686d75cffBdDE419a51eeFCE",
        ntk: "0x0d92A3De88202C929714df9cB24395CF4C15ba2e",
        genesis: "0x11DAA2d0ffCCE08B138BB345e3CdBc7d7483686d",
        nft: "0x66a309BFeEeC137411d2B0BaA890c79b864F8886",
        multisig: "0xED1873d82766D61D3A5564A62b71C6DCc1403366"
    }
};

const set2 = {
    name: "Set 2 (Desktop)",
    contracts: {
        notary: "0x26485F8140b90599C59a9664D6606FDBEeb63cdB",
        document: "0xb1506746Ce63d054471D79a4765dF97b5e3E716A",
        ntk: "0x446F3F7cAcD0d339A9944A48f32841c923AA8Dfb",
        genesis: "0x193a05372E0582ff491CCE8805110e2a38ff1243",
        nft: "0x0497C5132EB4EC4fbf9dDf88Dc5504042512ff08"
    }
};

async function checkLinkages(set) {
    console.log(`\n🔍 AUDITING: ${set.name}`);
    for (const [key, addr] of Object.entries(set.contracts)) {
        const contract = new ethers.Contract(addr, COMMON_ABI, provider);
        try {
            const owner = await contract.owner().catch(() => "N/A (AccessControl?)");
            const block = await provider.getBlockNumber();
            
            // Check for recent events (last 5000 blocks ~ 4 hours)
            const logs = await provider.getLogs({
                address: addr,
                fromBlock: block - 5000,
                toBlock: block
            });

            console.log(`\n📍 ${key.toUpperCase()}: ${addr}`);
            console.log(`   Owner: ${owner}`);
            console.log(`   Recent Activity: ${logs.length} events in last 4 hours`);
            
            // Linkage check (specific to notary registry)
            if (key === 'notary') {
                 try {
                     const registryAbi = ["function documentRegistry() view returns (address)"];
                     const reg = new ethers.Contract(addr, registryAbi, provider);
                     const linkedDoc = await reg.documentRegistry();
                     console.log(`   🔗 Linked to DocumentRegistry: ${linkedDoc}`);
                 } catch (e) {}
            }

        } catch (e) {
            console.log(`📍 ${key.toUpperCase()}: ${addr} -> 🛑 FAIL: ${e.message}`);
        }
    }
}

async function run() {
    await checkLinkages(set1);
    await checkLinkages(set2);
}

run();
