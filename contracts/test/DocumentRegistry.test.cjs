const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DocumentRegistry Hardened Audit Refinements", function () {
    let docRegistry, notaryRegistry, ntkToken;
    let governance, notary, relayer, owner, unauthorized;
    let chainId;

    beforeEach(async function () {
        [governance, notary, relayer, owner, unauthorized] = await ethers.getSigners();
        chainId = Number((await ethers.provider.getNetwork()).chainId);

        // 1. Deploy NotaryRegistry
        const NotaryRegistry = await ethers.getContractFactory("NotaryRegistry");
        notaryRegistry = await NotaryRegistry.deploy(governance.address);
        await notaryRegistry.waitForDeployment();

        // 2. Setup Roles & Relayer
        await notaryRegistry.connect(governance).assignOwner(notary.address);
        await notaryRegistry.connect(governance).promoteToNotary(notary.address);
        await notaryRegistry.connect(governance).updateRelayer(relayer.address);

        // 3. Deploy NTK Mock
        const NTKToken = await ethers.getContractFactory("NTKToken");
        ntkToken = await NTKToken.deploy(governance.address);
        await ntkToken.waitForDeployment();

        // 4. Deploy DocumentRegistry
        const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry");
        docRegistry = await DocumentRegistry.deploy(await notaryRegistry.getAddress(), await ntkToken.getAddress());
        await docRegistry.waitForDeployment();

        // 5. Grant RELAYER_ROLE for NTK burning
        const RELAYER_ROLE = await ntkToken.RELAYER_ROLE();
        await ntkToken.connect(governance).grantRole(RELAYER_ROLE, await docRegistry.getAddress());

        // 6. Mint NTK to notary
        await ntkToken.connect(governance).mintDailyNTK(notary.address);
    });

    async function getNotarizeSignature(signer, docHash, ownerAddress, status, summaryHash, rejectionReasonHash, timestamp, nonce) {
        const domain = {
            name: "BBSNS_Protocol",
            version: "1",
            chainId: chainId,
            verifyingContract: await docRegistry.getAddress()
        };

        const types = {
            Notarize: [
                { name: "docHash", type: "bytes32" },
                { name: "ownerAddress", type: "address" },
                { name: "status", type: "uint8" },
                { name: "summaryHash", type: "bytes32" },
                { name: "rejectionReasonHash", type: "bytes32" },
                { name: "timestamp", type: "uint256" },
                { name: "nonce", type: "uint256" }
            ]
        };

        const value = {
            docHash,
            ownerAddress,
            status,
            summaryHash,
            rejectionReasonHash,
            timestamp,
            nonce
        };

        return await signer.signTypedData(domain, types, value);
    }

    describe("Nonce-Based Replay Protection", function () {
        const docHash1 = ethers.id("doc1");
        const docHash2 = ethers.id("doc2");
        const status = 1;

        it("Should allow sequential notarizations with correct nonces", async function () {
            const timestamp = await time.latest();

            // First action (nonce 0)
            const sig0 = await getNotarizeSignature(notary, docHash1, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0);
            await docRegistry.connect(relayer).recordAction(docHash1, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0, sig0);
            expect(await docRegistry.nonces(notary.address)).to.equal(1);

            // Second action (nonce 1)
            const sig1 = await getNotarizeSignature(notary, docHash2, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 1);
            await docRegistry.connect(relayer).recordAction(docHash2, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 1, sig1);
            expect(await docRegistry.nonces(notary.address)).to.equal(2);
        });

        it("Should reject if nonce is incorrect", async function () {
            const timestamp = await time.latest();
            const sigWrongNonce = await getNotarizeSignature(notary, docHash1, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 1);

            await expect(docRegistry.connect(relayer).recordAction(docHash1, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 1, sigWrongNonce))
                .to.be.revertedWith("DocumentRegistry: Invalid nonce");
        });
    });

    describe("Timestamp Guards", function () {
        const docHash = ethers.id("test-doc");
        const status = 1;

        it("Should reject future signatures (> 5m drift)", async function () {
            const futureTime = (await time.latest()) + (10 * 60); // 10 minutes from now
            const sig = await getNotarizeSignature(notary, docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, futureTime, 0);

            await expect(docRegistry.connect(relayer).recordAction(docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, futureTime, 0, sig))
                .to.be.revertedWith("DocumentRegistry: Future signature");
        });

        it("Should reject expired signatures (> 24h old)", async function () {
            const oldTime = (await time.latest()) - (25 * 3600); // 25 hours ago
            const sig = await getNotarizeSignature(notary, docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, oldTime, 0);

            await expect(docRegistry.connect(relayer).recordAction(docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, oldTime, 0, sig))
                .to.be.revertedWith("DocumentRegistry: Signature expired");
        });
    });

    describe("Ban Enforcement", function () {
        const docHash = ethers.id("test-doc");
        const status = 1;

        it("Should reject if Notary is banned", async function () {
            await notaryRegistry.connect(governance).setBanStatus(notary.address, true);
            const timestamp = await time.latest();
            const sig = await getNotarizeSignature(notary, docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0);

            await expect(docRegistry.connect(relayer).recordAction(docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0, sig))
                .to.be.revertedWith("DocumentRegistry: Notary is banned");
        });

        it("Should reject if Owner is banned", async function () {
            await notaryRegistry.connect(governance).setBanStatus(owner.address, true);
            const timestamp = await time.latest();
            const sig = await getNotarizeSignature(notary, docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0);

            await expect(docRegistry.connect(relayer).recordAction(docHash, owner.address, status, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0, sig))
                .to.be.revertedWith("DocumentRegistry: Document owner is banned");
        });
    });

    describe("Self-Approval Check", function () {
        it("Should reject if Notary recovers to OwnerAddress", async function () {
            const docHash = ethers.id("self-approve");
            const timestamp = await time.latest();
            // Notary signs doc where THEY are the ownerAddress
            const sig = await getNotarizeSignature(notary, docHash, notary.address, 1, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0);

            await expect(docRegistry.connect(relayer).recordAction(docHash, notary.address, 1, ethers.ZeroHash, ethers.ZeroHash, timestamp, 0, sig))
                .to.be.revertedWith("DocumentRegistry: Notary cannot approve own document");
        });
    });
});
