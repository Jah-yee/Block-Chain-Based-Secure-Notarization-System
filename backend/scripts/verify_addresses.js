const { ethers } = require("ethers");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function checkContracts() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const sets = [
        {
            name: "ENV",
            ntk: "0x505388A24BA31F64A46dC10a7923EA4892c0B0C7",
            ntkr: "0x5E03361Fb7221b71E064510eE0E84f7c1895195F",
            registry: "0xdE08bb23e313C6A7C10F61303bE2ac6DE6a00d2d"
        },
        {
            name: "DEPLOYMENTS",
            ntk: "0xbB8bf3bbDa620416f856D50D2855fF1aC73552c2",
            ntkr: "0xfa0B6490f5807496fC4C9ff516de81cCb7B8551C",
            registry: "0x8921a60d3EF6F6Ece190428FF0b56655Cb87099B"
        }
    ];

    for (const set of sets) {
        console.log(`\n🔍 Checking SET: ${set.name}`);
        try {
            const code = await provider.getCode(set.ntk);
            console.log(`- NTK (${set.ntk}) code: ${code === '0x' ? 'EMPTY' : 'FOUND (' + code.length + ' chars)'}`);

            const registryCode = await provider.getCode(set.registry);
            console.log(`- Registry (${set.registry}) code: ${registryCode === '0x' ? 'EMPTY' : 'FOUND'}`);
        } catch (e) {
            console.log(`- Error checking SET ${set.name}: ${e.message}`);
        }
    }
}

checkContracts();
