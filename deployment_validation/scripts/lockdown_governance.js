const { ethers } = require("ethers");
require("dotenv").config();

async function lockdownGovernance() {
    const provider = new ethers.JsonRpcProvider(process.env.VITE_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/");
    const wallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);
    const multisigAddress = process.env.MULTISIG_CONTRACT_ADDRESS;

    const abi = [
        "function addSigner(address _newSigner)",
        "function changeThreshold(uint256 _newThreshold)",
        "function setTimelockDelay(uint256 _newDelay)",
        "function submitTransaction(address _to, uint256 _value, bytes _data) returns (uint256)",
        "function executeTransaction(uint256 _txIndex)",
        "function getTransactionCount() view returns (uint256)",
        "function threshold() view returns (uint256)",
        "function getSigners() view returns (address[])"
    ];

    const contract = new ethers.Contract(multisigAddress, abi, wallet);
    const secondarySigner = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Placeholder Cold Wallet #2

    console.log(`Starting Lockdown for ${multisigAddress}...`);

    // 1. Add Secondary Signer
    console.log("Step 1: Adding Secondary Signer...");
    const addSignerData = contract.interface.encodeFunctionData("addSigner", [secondarySigner]);
    let tx = await contract.submitTransaction(multisigAddress, 0, addSignerData);
    await tx.wait();
    let txCount = await contract.getTransactionCount();
    let txIndex = Number(txCount) - 1;
    console.log(`Submitted addSigner at txIndex: ${txIndex}`);

    // Execute immediately (Threshold is 1)
    tx = await contract.executeTransaction(txIndex);
    await tx.wait();
    console.log("Signer Added Successfully.");

    // 2. Set Timelock to 12 Hours (43200 seconds)
    console.log("Step 2: Setting Timelock to 12 Hours...");
    const setTimelockData = contract.interface.encodeFunctionData("setTimelockDelay", [43200]);
    tx = await contract.submitTransaction(multisigAddress, 0, setTimelockData);
    await tx.wait();
    txCount = await contract.getTransactionCount();
    txIndex = Number(txCount) - 1;
    tx = await contract.executeTransaction(txIndex);
    await tx.wait();
    console.log("Timelock Set Successfully.");

    // 3. Set Threshold to 2
    // WARNING: This will be delayed by 12 hours because we just set the timelock!
    console.log("Step 3: Submitting Threshold Change (2-of-2)...");
    const changeThresholdData = contract.interface.encodeFunctionData("changeThreshold", [2]);
    tx = await contract.submitTransaction(multisigAddress, 0, changeThresholdData);
    await tx.wait();
    txCount = await contract.getTransactionCount();
    txIndex = Number(txCount) - 1;
    console.log(`Threshold change submitted at txIndex: ${txIndex}. IT IS NOW LOCKED BY THE 12H TIMELOCK.`);
    console.log("You must wait 12 hours and then execute this transaction to finalize the 2-of-2 lock.");

}

lockdownGovernance().catch(console.error);
