const { ethers } = require("ethers");

const malformed = "f972e20b5fe554adcbd14047a7254873d8d596c166295bd1245d3688e75912cd3";
const target = "0x02252Db03aF7CD8C8d3eC6CFd3AE5f6dab69ACd0";

console.log("Malformed length:", malformed.length);
console.log("Target Address:", target);

for (let i = 0; i < malformed.length; i++) {
    const candidate = malformed.slice(0, i) + malformed.slice(i + 1);
    const wallet = new ethers.Wallet(candidate);
    if (wallet.address.toLowerCase() === target.toLowerCase()) {
        console.log(`✅ MATCH FOUND! Correct key obtained by removing character at index ${i} ('${malformed[i]}'):`);
        console.log(candidate);
        process.exit(0);
    }
}

console.log("❌ No match found.");
process.exit(1);
