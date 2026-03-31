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

const NOTARY_ABI = ["function multiSig() view returns (address)", "function adminCount() view returns (uint256)"];
const DOC_ABI = ["function notaryRegistry() view returns (address)", "function ntkToken() view returns (address)"];

async function verifyCohesion(set) {
    console.log(`\n🔗 VERIFYING COHESION: ${set.name}`);
    
    try {
        const notary = new ethers.Contract(set.contracts.notaryRegistry, NOTARY_ABI, provider);
        const doc = new ethers.Contract(set.contracts.documentRegistry, DOC_ABI, provider);

        // Notary -> MultiSig
        const mSig = await notary.multiSig();
        console.log(`   Notary -> MultiSig    : ${mSig}`);
        if (set.contracts.multisig) {
            console.log(`   Match Multisig?       : ${mSig.toLowerCase() === set.contracts.multisig.toLowerCase() ? '✅ YES' : '❌ NO'}`);
        }

        // Document -> Notary
        const linkedNotary = await doc.notaryRegistry();
        console.log(`   Document -> Notary    : ${linkedNotary}`);
        console.log(`   Match Notary?         : ${linkedNotary.toLowerCase() === set.contracts.notaryRegistry.toLowerCase() ? '✅ YES' : '❌ NO'}`);

        // Document -> NTK
        const linkedNtk = await doc.ntkToken();
        console.log(`   Document -> NTK       : ${linkedNtk}`);
        console.log(`   Match NTK?            : ${linkedNtk.toLowerCase() === set.contracts.ntk.toLowerCase() ? '✅ YES' : '❌ NO'}`);

        // Activity Check
        const admins = await notary.adminCount();
        console.log(`   Active Admins Count   : ${admins}`);

    } catch (e) {
        console.log(`   🛑 Cohesion Break: ${e.message}`);
    }
}

async function run() {
    await verifyCohesion(set1);
    await verifyCohesion(set2);
}

run();
