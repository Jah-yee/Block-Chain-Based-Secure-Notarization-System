require('dotenv').config({ path: '../.env' }); // Load .env from parent
const { ethers } = require("ethers");
const { connectBNB } = require("../src/blockchain/connection");
const NTKR_ABI = require("../../contracts/abi/NTKRToken.json");

async function fixPrices() {
    console.log("Starting NTKR Price Fix...");

    // Connect to blockchain
    const { provider, relayerSigner } = await connectBNB();

    const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
    if (!ntkrAddress) {
        throw new Error("NTKR_CONTRACT_ADDRESS not found in .env");
    }

    const abi = NTKR_ABI.abi || NTKR_ABI;
    const ntkrContract = new ethers.Contract(ntkrAddress, abi, relayerSigner);

    // Check Categories
    // Category 0: BASIC -> Should be 1 NTKR
    // Category 1: OFFICIAL -> Should be 5 NTKR

    console.log(`Checking prices on contract: ${ntkrAddress}`);

    const priceBasic = await ntkrContract.categoryPrices(0);
    const priceOfficial = await ntkrContract.categoryPrices(1);
    const priceHigh = await ntkrContract.categoryPrices(2);

    console.log(`Current Prices:`);
    console.log(`- Basic (0): ${ethers.formatEther(priceBasic)} NTKR`);
    console.log(`- Official (1): ${ethers.formatEther(priceOfficial)} NTKR`);
    console.log(`- High (2): ${ethers.formatEther(priceHigh)} NTKR`);

    const desiredBasic = ethers.parseEther("1.0");
    const desiredOfficial = ethers.parseEther("5.0");

    if (priceBasic.toString() !== desiredBasic.toString()) {
        console.log(`Fixing Basic Price to 1.0 NTKR...`);
        try {
            const tx = await ntkrContract.setCategoryPrice(0, desiredBasic);
            console.log(`Tx sent: ${tx.hash}`);
            await tx.wait();
            console.log(`Basic Price Updated!`);
        } catch (err) {
            console.error(`Failed to update Basic Price: ${err.message}`);
            console.error("Make sure the Relayer/Signer has DEFAULT_ADMIN_ROLE.");
        }
    } else {
        console.log("Basic Price is correct.");
    }

    if (priceOfficial.toString() !== desiredOfficial.toString()) {
        console.log(`Fixing Official Price to 5.0 NTKR...`);
        try {
            const tx = await ntkrContract.setCategoryPrice(1, desiredOfficial);
            console.log(`Tx sent: ${tx.hash}`);
            await tx.wait();
            console.log(`Official Price Updated!`);
        } catch (err) {
            console.error(`Failed to update Official Price: ${err.message}`);
        }
    } else {
        console.log("Official Price is correct.");
    }
}

fixPrices().catch(console.error);
