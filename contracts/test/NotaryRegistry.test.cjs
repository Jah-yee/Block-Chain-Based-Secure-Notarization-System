const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NotaryRegistry Hardened Audit Refinements", function () {
    let notaryRegistry;
    let multiSig, user1, user2, unauthorized;

    const Role = { NONE: 0, OWNER: 1, NOTARY: 2, ADMIN: 3 };

    beforeEach(async function () {
        [multiSig, user1, user2, unauthorized] = await ethers.getSigners();

        const NotaryRegistry = await ethers.getContractFactory("NotaryRegistry");
        notaryRegistry = await NotaryRegistry.deploy(multiSig.address);
        await notaryRegistry.waitForDeployment();
    });

    describe("Governance Safeguards", function () {
        it("Should prevent setting zero address as relayer", async function () {
            await expect(notaryRegistry.connect(multiSig).updateRelayer(ethers.ZeroAddress))
                .to.be.revertedWith("NotaryRegistry: Invalid relayer");
        });

        it("Should prevent removing multiSig address as a role", async function () {
            await expect(notaryRegistry.connect(multiSig).removeRole(multiSig.address))
                .to.be.revertedWith("NotaryRegistry: Cannot remove governance");
        });
    });

    describe("Admin Continuity (adminCount)", function () {
        it("Should track adminCount correctly", async function () {
            await notaryRegistry.connect(multiSig).assignOwner(user1.address);
            await notaryRegistry.connect(multiSig).promoteToNotary(user1.address);
            await notaryRegistry.connect(multiSig).promoteToAdmin(user1.address);
            expect(await notaryRegistry.adminCount()).to.equal(1);

            await notaryRegistry.connect(multiSig).assignOwner(user2.address);
            await notaryRegistry.connect(multiSig).promoteToNotary(user2.address);
            await notaryRegistry.connect(multiSig).promoteToAdmin(user2.address);
            expect(await notaryRegistry.adminCount()).to.equal(2);
        });

        it("Should prevent removing the last admin", async function () {
            await notaryRegistry.connect(multiSig).assignOwner(user1.address);
            await notaryRegistry.connect(multiSig).promoteToNotary(user1.address);
            await notaryRegistry.connect(multiSig).promoteToAdmin(user1.address);

            await expect(notaryRegistry.connect(multiSig).removeRole(user1.address))
                .to.be.revertedWith("NotaryRegistry: Cannot remove last admin");
        });

        it("Should allow removing an admin if more than one exists", async function () {
            await notaryRegistry.connect(multiSig).assignOwner(user1.address);
            await notaryRegistry.connect(multiSig).promoteToNotary(user1.address);
            await notaryRegistry.connect(multiSig).promoteToAdmin(user1.address);

            await notaryRegistry.connect(multiSig).assignOwner(user2.address);
            await notaryRegistry.connect(multiSig).promoteToNotary(user2.address);
            await notaryRegistry.connect(multiSig).promoteToAdmin(user2.address);

            await notaryRegistry.connect(multiSig).removeRole(user1.address);
            expect(await notaryRegistry.adminCount()).to.equal(1);
            expect(await notaryRegistry.getUserRole(user1.address)).to.equal(Role.NONE);
        });
    });

    describe("Ban Logic", function () {
        it("Should allow governance to set ban status", async function () {
            await expect(notaryRegistry.connect(multiSig).setBanStatus(user1.address, true))
                .to.emit(notaryRegistry, "UserBanned")
                .withArgs(user1.address, true, anyTimestamp());
            expect(await notaryRegistry.isBanned(user1.address)).to.be.true;
        });

        it("Should prevent promotion of banned users", async function () {
            await notaryRegistry.connect(multiSig).setBanStatus(user1.address, true);
            await expect(notaryRegistry.connect(multiSig).assignOwner(user1.address))
                .to.be.revertedWith("NotaryRegistry: User is banned");
        });

        it("Should prevent further promotion if banned after reaching a role", async function () {
            await notaryRegistry.connect(multiSig).assignOwner(user1.address);
            await notaryRegistry.connect(multiSig).setBanStatus(user1.address, true);
            await expect(notaryRegistry.connect(multiSig).promoteToNotary(user1.address))
                .to.be.revertedWith("NotaryRegistry: User is banned");
        });
    });
});

function anyTimestamp() {
    return (val) => val > 0;
}
