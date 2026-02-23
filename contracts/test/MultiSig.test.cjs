const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BBSNSMultiSig", function () {
    let multiSig;
    let signer1, signer2, signer3, signer4, signer5, nonSigner;
    let signers;
    const THRESHOLD = 3;
    const TIMELOCK = 3600; // 1 hour

    beforeEach(async function () {
        [signer1, signer2, signer3, signer4, signer5, nonSigner] = await ethers.getSigners();
        signers = [signer1.address, signer2.address, signer3.address, signer4.address, signer5.address];

        const BBSNSMultiSig = await ethers.getContractFactory("BBSNSMultiSig");
        multiSig = await BBSNSMultiSig.deploy(signers, THRESHOLD, TIMELOCK);
        await multiSig.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set correct signers and threshold", async function () {
            expect(await multiSig.getSigners()).to.deep.equal(signers);
            expect(await multiSig.threshold()).to.equal(THRESHOLD);
            expect(await multiSig.timelockDelay()).to.equal(TIMELOCK);
            expect(await multiSig.signerVersion()).to.equal(1);

            for (let s of signers) {
                expect(await multiSig.isSigner(s)).to.be.true;
            }
        });

        it("Should fail if threshold is zero", async function () {
            const BBSNSMultiSig = await ethers.getContractFactory("BBSNSMultiSig");
            await expect(BBSNSMultiSig.deploy(signers, 0, TIMELOCK)).to.be.revertedWith("MultiSig: Invalid threshold");
        });
    });

    describe("Transactions", function () {
        const to = "0x0000000000000000000000000000000000000001";
        const value = ethers.parseEther("0.1");
        const data = "0x1234";

        it("Should fail if to address is zero", async function () {
            await expect(multiSig.connect(signer1).submitTransaction(ethers.ZeroAddress, value, data, ethers.ZeroHash))
                .to.be.revertedWith("MultiSig: Invalid target address");
        });

        it("Should allow signer to submit transaction", async function () {
            await expect(multiSig.connect(signer1).submitTransaction(to, value, data, ethers.ZeroHash))
                .to.emit(multiSig, "TransactionSubmitted")
                .withArgs(0, signer1.address, to, value, data, ethers.ZeroHash);

            const tx = await multiSig.getTransaction(0);
            expect(tx.to).to.equal(to);
            expect(tx.txSignerVersion).to.equal(1);
        });

        it("Should allow other signers to confirm", async function () {
            await multiSig.connect(signer1).submitTransaction(to, value, data, ethers.ZeroHash); // tx 0

            await expect(multiSig.connect(signer2).confirmTransaction(0))
                .to.emit(multiSig, "TransactionConfirmed")
                .withArgs(0, signer2.address);

            const tx = await multiSig.getTransaction(0);
            expect(tx.numConfirmations).to.equal(2);
        });

        it("Should prevent double confirmation", async function () {
            await multiSig.connect(signer1).submitTransaction(to, value, data, ethers.ZeroHash);
            await expect(multiSig.connect(signer1).confirmTransaction(0))
                .to.be.revertedWith("MultiSig: Transaction already confirmed");
        });

        it("Should allow revoking confirmation", async function () {
            await multiSig.connect(signer1).submitTransaction(to, value, data, ethers.ZeroHash);
            await multiSig.connect(signer2).confirmTransaction(0);

            await expect(multiSig.connect(signer2).revokeConfirmation(0))
                .to.emit(multiSig, "TransactionRevoked")
                .withArgs(0, signer2.address);

            const tx = await multiSig.getTransaction(0);
            expect(tx.numConfirmations).to.equal(1);
        });
    });

    describe("Execution & Timelock", function () {
        const to = "0x0000000000000000000000000000000000000002";
        const value = 0;
        const data = "0x";

        beforeEach(async function () {
            await multiSig.connect(signer1).submitTransaction(to, value, data, ethers.ZeroHash); // tx 0
            await multiSig.connect(signer2).confirmTransaction(0);
            await multiSig.connect(signer3).confirmTransaction(0);
        });

        it("Should fail execution if timelock is active", async function () {
            await expect(multiSig.connect(signer1).executeTransaction(0))
                .to.be.revertedWith("MultiSig: Timelock active");
        });

        it("Should execute successfully after timelock", async function () {
            await time.increase(TIMELOCK);

            await expect(multiSig.connect(signer1).executeTransaction(0))
                .to.emit(multiSig, "TransactionExecuted")
                .withArgs(0, signer1.address, to, value);

            const tx = await multiSig.getTransaction(0);
            expect(tx.executed).to.be.true;
        });

        it("Should invalidate transaction if signers change before execution", async function () {
            // Threshold met, timelock passed for tx 0
            await time.increase(TIMELOCK);

            // But now we remove signer5 (requires a separate MultiSig action: tx 1)
            const removeData = multiSig.interface.encodeFunctionData("removeSigner", [signer5.address]);
            await multiSig.connect(signer1).submitTransaction(await multiSig.getAddress(), 0, removeData, ethers.ZeroHash); // tx 1 (auto-confirmed by signer1)
            await multiSig.connect(signer2).confirmTransaction(1);
            await multiSig.connect(signer3).confirmTransaction(1);

            // Advance time for tx 1 execution
            await time.increase(TIMELOCK);
            await multiSig.connect(signer1).executeTransaction(1); // Execute rotation, version becomes 2

            // Now try to execute tx 0 (which was submitted under version 1)
            await expect(multiSig.connect(signer1).executeTransaction(0))
                .to.be.revertedWith("MultiSig: Signer set rotated since submission");
        });

        it("Should prevent double execution", async function () {
            await time.increase(TIMELOCK);
            await multiSig.connect(signer1).executeTransaction(0);

            await expect(multiSig.connect(signer1).executeTransaction(0))
                .to.be.revertedWith("MultiSig: Transaction already executed");
        });
    });

    describe("Signer Rotation (Self-Calls)", function () {
        it("Should ONLY allow self-calls for addSigner", async function () {
            await expect(multiSig.connect(signer1).addSigner(nonSigner.address))
                .to.be.revertedWith("MultiSig: Only self-call allowed");
        });

        it("Should add a signer and increment version", async function () {
            const initialVersion = await multiSig.signerVersion();
            const data = multiSig.interface.encodeFunctionData("addSigner", [nonSigner.address]);

            await multiSig.connect(signer1).submitTransaction(await multiSig.getAddress(), 0, data, ethers.ZeroHash); // tx 0
            await multiSig.connect(signer2).confirmTransaction(0);
            await multiSig.connect(signer3).confirmTransaction(0);

            await time.increase(TIMELOCK);
            await multiSig.connect(signer1).executeTransaction(0);

            expect(await multiSig.signerVersion()).to.equal(initialVersion + 1n);
            expect(await multiSig.isSigner(nonSigner.address)).to.be.true;
        });

        it("Should prevent removing signer if it would break threshold", async function () {
            // First change threshold to 5
            const dataThreshold = multiSig.interface.encodeFunctionData("changeThreshold", [5]);
            await multiSig.connect(signer1).submitTransaction(await multiSig.getAddress(), 0, dataThreshold, ethers.ZeroHash); // tx 0
            await multiSig.connect(signer2).confirmTransaction(0);
            await multiSig.connect(signer3).confirmTransaction(0);
            await time.increase(TIMELOCK);
            await multiSig.connect(signer1).executeTransaction(0); // Version becomes 2, Threshold becomes 5

            // Now try to remove signer5 (signers would become 4, which is < threshold 5)
            const dataRemove = multiSig.interface.encodeFunctionData("removeSigner", [signer5.address]);
            await multiSig.connect(signer1).submitTransaction(await multiSig.getAddress(), 0, dataRemove, ethers.ZeroHash); // tx 1
            await multiSig.connect(signer2).confirmTransaction(1);
            await multiSig.connect(signer3).confirmTransaction(1);
            await multiSig.connect(signer4).confirmTransaction(1);
            await multiSig.connect(signer5).confirmTransaction(1);

            await time.increase(TIMELOCK);

            // The call to removeSigner will fail inside executeTransaction because of the guardrail
            await expect(multiSig.connect(signer1).executeTransaction(1))
                .to.be.revertedWith("MultiSig: Transaction execution failed");
        });
    });

    describe("Edge Cases", function () {
        it("Should allow native ETH transfer", async function () {
            await signer1.sendTransaction({
                to: await multiSig.getAddress(),
                value: ethers.parseEther("1.0")
            });

            const to = nonSigner.address;
            const value = ethers.parseEther("1.0");
            const initialBalance = await ethers.provider.getBalance(to);

            await multiSig.connect(signer1).submitTransaction(to, value, "0x", ethers.ZeroHash); // tx 0
            await multiSig.connect(signer2).confirmTransaction(0);
            await multiSig.connect(signer3).confirmTransaction(0);

            await time.increase(TIMELOCK);
            await multiSig.connect(signer1).executeTransaction(0);

            expect(await ethers.provider.getBalance(to)).to.equal(initialBalance + value);
        });
    });
});
