const { requirePrivilege, RISK_LEVELS, ROLES } = require('../middleware/actor');
const jwt = require('jsonwebtoken');
const pool = require('../src/db/index');
const { ethers } = require('ethers');

jest.mock('../src/db/index');
jest.mock('ethers');

describe('requirePrivilege Middleware (Zero-Trust Audit)', () => {
    let req, res, next;
    const JWT_SECRET = 'test-secret';
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.CHAIN_ID = '97'; // BNB Testnet

    beforeEach(() => {
        req = {
            headers: {},
            cookies: {},
            actor: null
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    const createToken = (payload) => {
        return jwt.sign(payload, JWT_SECRET);
    };

    // 1. No JWT → 401
    test('1. Should return 401 if no JWT is present', async () => {
        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Unauthorized') }));
    });

    // 2. Wrong chainId → 426
    test('2. Should return 426 if snapshotChainId mismatches server config', async () => {
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '1', // Wrong
            snapshotBlock: 100,
            issuedAt: Date.now()
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(426);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Network Context') }));
    });

    // 3. snapshotBlock future → 426
    test('3. Should return 426 if snapshotBlock is in the future (> tolerance)', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockResolvedValue(100);
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 200, // Future
            issuedAt: Date.now()
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(426);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Block Drift') }));
    });

    // 4. snapshotBlock backward drift → 426
    test('4. Should return 426 if snapshotBlock is too old (> 24h)', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockResolvedValue(100000);
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100, // Too old
            issuedAt: Date.now()
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(426);
    });

    // 5. RPC down + RISK_HIGH → 503
    test('5. Should return 503 if RPC is down for RISK_HIGH operation', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockRejectedValue(new Error('RPC Down'));
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100,
            issuedAt: Date.now()
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.NOTARY, risk: RISK_LEVELS.HIGH });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(503);
    });

    // 6. RPC down + RISK_LOW < 5m → 200 (Allow)
    test('6. Should allow RISK_LOW if RPC is down but JWT is fresh (< 5m)', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockRejectedValue(new Error('RPC Down'));
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100,
            role: ROLES.OWNER,
            issuedAt: Date.now() - (3 * 60 * 1000) // 3 mins ago (< 5m)
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    // 7. RPC down + RISK_LOW > 5m → 503
    test('7. Should return 503 if RPC is down and RISK_LOW JWT is stale (> 5m)', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockRejectedValue(new Error('RPC Down'));
        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100,
            issuedAt: Date.now() - (10 * 60 * 1000) // 10 mins ago (> 5m)
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(503);
    });

    // 8. Demoted mid-session → 403
    test('8. Should return 403 if user demoted on-chain (LIVE CHECK)', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockResolvedValue(110);
        // Mock Contract call
        const mockContract = {
            getUserRole: jest.fn().mockResolvedValue(ROLES.OWNER), // Demoted from NOTARY
            isBanned: jest.fn().mockResolvedValue(false)
        };
        ethers.Contract.mockImplementation(() => mockContract);

        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100,
            role: ROLES.NOTARY,
            issuedAt: Date.now()
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.NOTARY, risk: RISK_LEVELS.HIGH });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Insufficient') }));
    });

    // 9. Banned mid-session → 403
    test('9. Should return 403 if user banned on-chain (LIVE CHECK)', async () => {
        ethers.JsonRpcProvider.prototype.getBlockNumber = jest.fn().mockResolvedValue(110);
        const mockContract = {
            getUserRole: jest.fn().mockResolvedValue(ROLES.NOTARY),
            isBanned: jest.fn().mockResolvedValue(true) // Banned
        };
        ethers.Contract.mockImplementation(() => mockContract);

        req.headers.authorization = `Bearer ${createToken({
            address: '0x123',
            snapshotChainId: '97',
            snapshotBlock: 100,
            role: ROLES.NOTARY,
            issuedAt: Date.now()
        })}`;
        const middleware = requirePrivilege({ minRole: ROLES.NOTARY, risk: RISK_LEVELS.HIGH });
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Banned') }));
    });

    // 10. Route without capability → 500
    test('10. Should return 500 if capability declaration is missing', async () => {
        const middleware = requirePrivilege(null); // Missing config
        await middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Configuration Error') }));
    });
});
