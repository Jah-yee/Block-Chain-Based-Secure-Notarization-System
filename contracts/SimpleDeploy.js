import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: '../backend/.env' });

async function main() {
    const provider = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545');
    const wallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);
    console.log('Deployer:', wallet.address);

    const load = (name, file) => JSON.parse(fs.readFileSync(`./artifacts/contracts/${file}.sol/${name}.json`, 'utf8'));

    // Use PREVIOUSLY deployed addresses from the successful step to avoid re-deploying them
    const msAddress = "0xc0924c217fE5A78C5A4c8F8edE402025E549e31f";
    const nftAddress = "0x5994Dcb2187a9316f6b062E0192ba91eb64A4c22";

    console.log('Reusing MS:', msAddress);
    console.log('Reusing NFT:', nftAddress);

    // 3. GenesisActivation - RAW Send
    console.log('Building GenesisActivation transaction...');
    const actsArtifact = load('GenesisActivation', 'GenesisActivation');
    const actsFactory = new ethers.ContractFactory(actsArtifact.abi, actsArtifact.bytecode, wallet);
    
    // Test if we can at least get the deploy transaction
    const deployTx = await actsFactory.getDeployTransaction(nftAddress, msAddress, { 
        gasLimit: 5000000,
        gasPrice: (await provider.getFeeData()).gasPrice * 15n / 10n
    });
    
    console.log('Sending raw deployment transaction...');
    const response = await wallet.sendTransaction(deployTx);
    console.log('Waiting for confirmation... Hash:', response.hash);
    
    const receipt = await response.wait();
    console.log('Activation Deployed at:', receipt.contractAddress);
    
    console.log('DONE');
}
main().catch(console.error);
