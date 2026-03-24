/**
 * Test-only mock for auth middleware
 * 
 * SECURITY CRITICAL:
 * - This file is ONLY for test environments
 * - NEVER imported in production code
 * - Provides mock authentication for Jest tests
 * 
 * Usage in test files:
 * jest.mock('../src/middleware/auth', () => require('./mocks/authMiddleware'));
 */

const mockAuthMiddleware = (req, res, next) => {
    // Mock user for tests
    req.user = 'test_wallet_address';
    req.actor = {
        id: 1,
        username: 'test_user',
        email: 'test@example.com',
        wallet_address: 'test_wallet_address',
        role: 'admin',
        kyc_status: 'verified',
        kyc_verified: true,
        is_deactivated: false
    };
    next();
};

const mockLoadActor = mockAuthMiddleware;

const mockRequireRole = (role) => {
    return (req, res, next) => {
        // Mock always passes role check in tests
        next();
    };
};

module.exports = {
    authMiddleware: mockAuthMiddleware,
    loadActor: mockLoadActor,
    requireRole: mockRequireRole
};
