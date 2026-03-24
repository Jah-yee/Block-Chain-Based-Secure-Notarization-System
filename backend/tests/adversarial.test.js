const { requirePrivilege, RISK_LEVELS, ROLES } = require('../middleware/actor');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');

jest.mock('ethers');

describe('Adversarial Stress-Testing (Combined State Coverage)', () => {
    let req, res, next;
    const JWT_SECRET = 'adversarial-secret';
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.CHAIN_ID = '97';

    beforeEach(() => {
        req = { headers: {}, cookies: {}, actor: null };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        next = jest.fn();
        jest.clearAllMocks();
    });

    const createToken = (payload) => jwt.sign(payload, JWT_SECRET);

    // 1. RPC Down + Chain ID Mismatch
    // Logic: Chain ID check happens BEFORE block number retrieval. It must fail with 426 (Network Context).
    test('AD-1: Should fail on Chain ID Mismatch even if RPC is Down', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockRejectedValue(new Error('RPC Down'));
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '1', // Mismatch
            snapshotBlock: 100,
            issuedAt: Date.now()
        })}`;

        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(426);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Upgrade Required: Incorrect Network Context' }));
        expect(next).not.toHaveBeenCalled();
    });

    // 2. Banned User + Fresh JWT (< 5m) + RISK_HIGH
    // Logic: RISK_HIGH MUST trigger live check, regardless of JWT age.
    test('AD-2: Should deny Banned User even with Fresh JWT on RISK_HIGH', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockResolvedValue(100);
        const mockContract = {
            getUserRole: jest.fn().mockResolvedValue(ROLES.NOTARY),
            isBanned: jest.fn().mockResolvedValue(true) // Banned!
        };
        ethers.Contract.mockImplementation(() => mockContract);

        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100,
            role: ROLES.NOTARY,
            issuedAt: Date.now() // Very fresh
        })}`;

        const middleware = requirePrivilege({ minRole: ROLES.NOTARY, risk: RISK_LEVELS.HIGH });
        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden: Account Banned' }));
    });

    // 3. Block Drift + Mid-Session Demotion
    // Logic: Block drift > tolerance should trigger a re-audit or rejection.
    test('AD-3: Should reject on Block Drift even if user is not banned (Sanity Check)', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockResolvedValue(100000); // Current is far ahead
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100, // Stale snapshot
            issuedAt: Date.now()
        })}`;

        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(426);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Session State Stale') }));
    });

    // 4. Malformed JWT Shape (Correct Signature)
    test('AD-4: Should fail on structurally invalid JWT payload', async () => {
        // Missing snapshotChainId
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            // snapshotChainId missing
            snapshotBlock: 100,
            issuedAt: Date.now()
        })}`;

        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(426);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Upgrade Required: Incorrect Network Context' }));
    });

    // 5. User Demoted + Fresh JWT (< 5m) + RISK_LOW Refresh Trigger
    // We lowered the window to 5m. Let's test if it triggers.
    test('AD-5: Should catch demotion on RISK_LOW after 5 minute window', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockResolvedValue(110);
        const mockContract = {
            getUserRole: jest.fn().mockResolvedValue(ROLES.OWNER), // Demoted from ADMIN
            isBanned: jest.fn().mockResolvedValue(false)
        };
        ethers.Contract.mockImplementation(() => mockContract);

        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100,
            role: ROLES.ADMIN,
            issuedAt: Date.now() - (6 * 60 * 1000) // 6 mins ago (> 5m)
        })}`;

        const middleware = requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Insufficient Authority') }));
    });
});
