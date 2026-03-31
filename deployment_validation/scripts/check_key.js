const { ethers } = require("ethers");
require('dotenv').config();

async function checkKey() {
    const pk = process.env.BNB_SYSTEM_PRIVATE_KEY;
    const wallet = new ethers.Wallet(pk);
    console.log(`System Key Address: ${wallet.address}`);
    console.log(`Expected Admin: ${process.env.BOOTSTRAP_ADMIN_WALLET}`);
}

checkKey();
