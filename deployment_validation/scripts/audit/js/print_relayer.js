const { connectBNB } = require("./src/blockchain/connection");
require("dotenv").config();

async function printRelayer() {
    try {
        const { signer } = await connectBNB();
        const address = await signer.getAddress();
        console.log("RELAYER_ADDRESS=" + address);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

printRelayer();
