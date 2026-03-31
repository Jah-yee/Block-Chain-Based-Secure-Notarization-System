const { ethers } = require("ethers");
require('dotenv').config();

async function checkRegistries() {
    const oldReg = "0xEA5EaDcCA97c101dB88821A1bF92677603e5e588";
    const newReg = "0x8921a60d3EF6F6Ece190428FF0b56655Cb87099B";

    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);

    console.log("Checking OLD Registry:", oldReg);
    try {
        const code = await provider.getCode(oldReg);
        console.log(`Old Code Len: ${code.length}`);
        const c = new ethers.Contract(oldReg, ["function owner() view returns (address)"], provider);
        const o = await c.owner();
        console.log(`Old Owner: ${o}`);
    } catch (e) { console.log("Old Check Failed:", e.message); }

    console.log("Checking NEW Registry (from deployments.json):", newReg);
    try {
        const code = await provider.getCode(newReg);
        console.log(`New Code Len: ${code.length}`);
        const c = new ethers.Contract(newReg, ["function owner() view returns (address)"], provider);
        const o = await c.owner();
        console.log(`New Owner: ${o}`);
    } catch (e) { console.log("New Check Failed:", e.message); }
}

checkRegistries();
