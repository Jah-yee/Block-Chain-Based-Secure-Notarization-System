const ACTION_POLICIES = {
    // --- AUTH DOMAIN ---
    AUTH_NONCE: {
        description: "Generate wallet nonce",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'AUTH_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'UPDATE' },
            { table: 'AUTH_NONCES', op: 'INSERT' },
            { table: 'SYSTEM_CONFIG', op: 'SELECT' }
        ]
    },
    AUTH_LOGIN: {
        description: "Verify wallet login",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'AUTH_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'UPDATE' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'USERS', op: 'INSERT', optional: true },
            { table: 'NOTARY_APPLICATIONS', op: 'SELECT', optional: true },
            { table: 'REMOTE_AUTH_SESSIONS', op: 'SELECT', optional: true }
        ]
    },
    AUTH_LOGOUT: {
        description: "Invalidate session",
        actor: "ANY",
        requiresStrong: false,
        rules: []
    },
    AUTH_PRECHECK: {
        description: "Pre-check wallet state",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'USERS', op: 'SELECT' },
            { table: 'SYSTEM_CONFIG', op: 'SELECT' }
        ]
    },
    AUTH_SYSTEM_STATUS: {
        description: "Check system health",
        actor: "GUEST",
        requiresStrong: false,
        rules: []
    },
    AUTH_REMOTE_SESSION: {
        description: "Create remote auth session",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'REMOTE_AUTH_SESSIONS', op: 'INSERT' }
        ]
    },
    REMOTE_IDENTITY_BINDING: {
        description: "Bind web identity to remote session",
        actor: "ANY",
        requiresStrong: false,
        rules: [
            { table: 'REMOTE_AUTH_SESSIONS', op: 'SELECT' },
            { table: 'REMOTE_AUTH_SESSIONS', op: 'UPDATE' }
        ]
    },
    REMOTE_STATUS_CONSUMPTION: {
        description: "Conditionally consume completed remote handshake session (Triple-Bind Enforcement)",
        actor: "GUEST",
        requiresStrong: false,
        rules: [

            { table: 'REMOTE_AUTH_SESSIONS', op: 'SELECT' },
            { table: 'REMOTE_AUTH_SESSIONS', op: 'UPDATE' },
            { table: 'USERS', op: 'SELECT' }
        ]
    },

    REMOTE_ADMIN_SYNC: {
        description: "Sync remote identity for admin console",
        actor: "SYSTEM",
        requiresStrong: true,
        rules: [
            { table: 'REMOTE_AUTH_SESSIONS', op: 'SELECT' },
            { table: 'REMOTE_AUTH_SESSIONS', op: 'UPDATE' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'USERS', op: 'INSERT', optional: true }
        ]
    },

    // --- DOCUMENTS DOMAIN ---
    DOC_UPLOAD_INITIATE: {
        description: "Request file upload intent",
        actor: "OWNER",
        requiresStrong: true,
        rules: [
            { table: 'DOCUMENTS', op: 'SELECT' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'UPLOAD_INTENTS', op: 'INSERT' }
        ]
    },
    DOC_UPLOAD_CONFIRM: {
        description: "Verify payment and provision document",
        actor: "OWNER",
        requiresStrong: true,
        rules: [
            { table: 'UPLOAD_INTENTS', op: 'SELECT' },
            { table: 'UPLOAD_INTENTS', op: 'UPDATE' },
            { table: 'DOCUMENTS', op: 'INSERT' },
            { table: 'DOCUMENTS', op: 'SELECT' },
            { table: 'NTKR_TRANSACTIONS', op: 'INSERT' }
        ]
    },
    DOC_UPDATE: {
        description: "Update document metadata",
        actor: "OWNER",
        requiresStrong: true,
        rules: [
            { table: 'DOCUMENTS', op: 'SELECT' },
            { table: 'DOCUMENTS', op: 'UPDATE' }
        ]
    },
    DOC_APPROVE: {
        description: "Notary approval of document",
        actor: "NOTARY",
        requiresStrong: true,
        rules: [
            { table: 'DOCUMENTS', op: 'SELECT' },
            { table: 'DOCUMENTS', op: 'UPDATE' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'RELAYER_NONCES', op: 'SELECT' },
            { table: 'RELAYER_NONCES', op: 'UPDATE' },
            { table: 'RELAYER_NONCES', op: 'INSERT' }
        ]
    },
    DOC_DELETE: {
        description: "Delete document record",
        actor: "OWNER",
        requiresStrong: true,
        rules: [
            { table: 'DOCUMENTS', op: 'SELECT' },
            { table: 'DOCUMENTS', op: 'DELETE' }
        ]
    },
    DOC_INTENT_READ: { description: "Read upload intent", actor: "OWNER", requiresStrong: false, rules: [{ table: 'UPLOAD_INTENTS', op: 'SELECT' }] },
    DOC_LIST: { description: "List documents", actor: "OWNER", requiresStrong: false, rules: [{ table: 'DOCUMENTS', op: 'SELECT' }] },
    DOC_SIGNATURE_PAYLOAD: { description: "Get signing payload", actor: "NOTARY", requiresStrong: false, rules: [{ table: 'DOCUMENTS', op: 'SELECT' }, { table: 'USERS', op: 'SELECT', optional: true }] },
    DOC_READ: { description: "Read document metadata", actor: "OWNER", requiresStrong: false, rules: [{ table: 'DOCUMENTS', op: 'SELECT' }] },
    DOC_DOWNLOAD: { description: "Download document file", actor: "OWNER", requiresStrong: true, rules: [{ table: 'DOCUMENTS', op: 'SELECT' }] },

    // --- USERS DOMAIN ---
    USERS_REGISTER: {
        description: "Manual record creation (Document Owner)",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'USERS', op: 'INSERT' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'WALLET_NONCES', op: 'UPDATE' },
            { table: 'WALLET_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'UPDATE' },
            { table: 'USER_STATE_HISTORY', op: 'INSERT' }
        ]
    },
    USERS_CREATE: { description: "Admin create user", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'USERS', op: 'INSERT' }] },
    USERS_UPDATE: { description: "Update user profile", actor: "ANY", requiresStrong: true, rules: [{ table: 'USERS', op: 'UPDATE' }] },
    USERS_DEACTIVATE: { description: "Admin deactivate user", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'USERS', op: 'UPDATE' }] },
    USERS_LIST: { description: "Admin list users", actor: "ADMIN", requiresStrong: false, rules: [{ table: 'USERS', op: 'SELECT' }] },
    USERS_READ: { description: "Read user profile", actor: "ANY", requiresStrong: false, rules: [{ table: 'USERS', op: 'SELECT' }] },

    // --- NOTARY DOMAIN ---
    NOTARY_APP_SUBMIT: {
        description: "Submit notary application",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'NOTARY_APPLICATIONS', op: 'INSERT' },
            { table: 'NOTARY_APPLICATIONS', op: 'UPDATE' },
            { table: 'NOTARY_APPLICATIONS', op: 'SELECT' },
            { table: 'USERS', op: 'SELECT' }
        ]
    },
    NOTARY_APP_VERIFY: { description: "Verify application status", actor: "ANY", requiresStrong: false, rules: [{ table: 'NOTARY_APPLICATIONS', op: 'SELECT' }] },
    NOTARY_APP_APPROVE: {
        description: "Admin approve application",
        actor: "ADMIN",
        requiresStrong: true,
        rules: [
            { table: 'NOTARY_APPLICATIONS', op: 'UPDATE' },
            { table: 'NOTARY_APPLICATIONS', op: 'SELECT' },
            { table: 'SYSTEM_LOGS', op: 'INSERT' }
        ]
    },
    NOTARY_TOKEN_RESEND: { description: "Resend activation token", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'NOTARY_APPLICATIONS', op: 'UPDATE' }] },
    NOTARY_APP_REJECT: { description: "Admin reject application", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'NOTARY_APPLICATIONS', op: 'UPDATE' }] },
    NOTARY_APP_LIST: { description: "Admin list applications", actor: "ADMIN", requiresStrong: false, rules: [{ table: 'NOTARY_APPLICATIONS', op: 'SELECT' }] },
    NOTARY_LIST: { description: "List all notaries", actor: "ANY", requiresStrong: false, rules: [{ table: 'USERS', op: 'SELECT' }] },
    NOTARY_READ: { description: "Read notary details", actor: "ANY", requiresStrong: false, rules: [{ table: 'USERS', op: 'SELECT' }] },
    NOTARY_ONBOARD: {
        description: "On-chain notary sync",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'USERS', op: 'INSERT' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'WALLET_NONCES', op: 'UPDATE' },
            { table: 'WALLET_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'UPDATE' },
            { table: 'USER_STATE_HISTORY', op: 'INSERT' }
        ]
    },
    NOTARY_ACTIVATE: {
        description: "Notary credential provisioning",
        actor: "ANY",
        requiresStrong: false,
        rules: [
            { table: 'NOTARY_APPLICATIONS', op: 'SELECT' },
            { table: 'NOTARY_APPLICATIONS', op: 'UPDATE' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'USERS', op: 'INSERT', optional: true },
            { table: 'USERS', op: 'UPDATE', optional: true },
            { table: 'USER_STATE_HISTORY', op: 'INSERT' },
            { table: 'SYSTEM_CONFIG', op: 'SELECT' }
        ]
    },

    // --- GOVERNANCE & ADMIN ---
    ADMIN_ONBOARD_GENESIS: {
        description: "Initial system bootstrap",
        actor: "GUEST",
        requiresStrong: false,
        rules: [
            { table: 'USERS', op: 'INSERT' },
            { table: 'USERS', op: 'SELECT' },
            { table: 'WALLET_NONCES', op: 'UPDATE' },
            { table: 'WALLET_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'SELECT' },
            { table: 'AUTH_NONCES', op: 'UPDATE' },
            { table: 'USER_STATE_HISTORY', op: 'INSERT' }
        ]
    },
    GOV_READ: { description: "Read multisig settings", actor: "ANY", requiresStrong: false, rules: [{ table: 'SYSTEM_CONFIG', op: 'SELECT' }] },
    GOV_PROPOSAL_LIST: { description: "List governance proposals", actor: "ANY", requiresStrong: false, rules: [{ table: 'GOVERNANCE_PROPOSALS', op: 'SELECT' }] },
    GOV_PROPOSAL_CREATE: { description: "Create gov proposal", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'GOVERNANCE_PROPOSALS', op: 'INSERT' }] },
    GOV_PROPOSAL_CANCEL: { description: "Cancel gov proposal", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'GOVERNANCE_PROPOSALS', op: 'UPDATE' }] },
    GOV_VOTE_SUBMIT: { description: "Submit vote", actor: "NOTARY", requiresStrong: true, rules: [{ table: 'GOVERNANCE_VOTES', op: 'INSERT' }] },
    GOV_ONCHAIN_SUBMIT: { description: "Submit to chain", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'GOVERNANCE_PROPOSALS', op: 'UPDATE' }] },
    GOV_REMOTE_INIT: { description: "Initiate remote vote", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'GOVERNANCE_VOTES', op: 'INSERT' }] },
    GOV_REMOTE_AUTHORIZE: { description: "Authorize vote", actor: "ANY", requiresStrong: false, rules: [{ table: 'GOVERNANCE_VOTES', op: 'UPDATE' }] },
    GOV_REMOTE_STATUS: { description: "Poll remote session status", actor: "GUEST", requiresStrong: false, rules: [{ table: 'REMOTE_GOV_SESSIONS', op: 'SELECT' }] },
    GOV_PROPOSAL_EXECUTE: {
        description: "Fulfill approved proposal on-chain and off-chain",
        actor: "ADMIN",
        requiresStrong: true,
        rules: [
            { table: 'GOVERNANCE_PROPOSALS', op: 'SELECT' },
            { table: 'GOVERNANCE_PROPOSALS', op: 'UPDATE' },
            { table: 'USERS', op: 'UPDATE', optional: true },
            { table: 'SYSTEM_CONFIG', op: 'SELECT', optional: true },
            { table: 'SYSTEM_LOGS', op: 'INSERT' }
        ]
    },

    // --- TRANSACTIONS ---
    TX_APPROVE_VOTE: { description: "Approve transaction", actor: "NOTARY", requiresStrong: true, rules: [{ table: 'NTKR_TRANSACTIONS', op: 'UPDATE' }] },
    TX_LIST: { description: "List transactions", actor: "ADMIN", requiresStrong: false, rules: [{ table: 'NTKR_TRANSACTIONS', op: 'SELECT' }] },
    TX_READ: { description: "Read transaction details", actor: "ANY", requiresStrong: false, rules: [{ table: 'NTKR_TRANSACTIONS', op: 'SELECT' }] },

    // --- DISPUTES ---
    DISPUTE_LIST: { description: "List disputes", actor: "ANY", requiresStrong: false, rules: [{ table: 'DISPUTES', op: 'SELECT' }] },
    DISPUTE_READ: { description: "Read dispute details", actor: "ANY", requiresStrong: false, rules: [{ table: 'DISPUTES', op: 'SELECT' }] },
    DISPUTE_SUBMIT: { description: "Submit new dispute", actor: "OWNER", requiresStrong: true, rules: [{ table: 'DISPUTES', op: 'INSERT' }] },
    DISPUTE_RESOLVE: { description: "Admin resolve dispute", actor: "ADMIN", requiresStrong: true, rules: [{ table: 'DISPUTES', op: 'UPDATE' }] },

    // --- SYSTEM & TOKENS ---
    SYSTEM_READ: { description: "Read system configuration", actor: "ANY", requiresStrong: false, rules: [] },
    SYSTEM_CONFIG_UPDATE: { description: "Admin update config", actor: "ADMIN", requiresStrong: true, rules: [] },
    SYSTEM_LOGS: { description: "Read system logs", actor: "ADMIN", requiresStrong: false, rules: [] },
    TOKEN_READ: { description: "Read token balances", actor: "ANY", requiresStrong: false, rules: [] },
    TOKEN_MINT: { description: "Mint tokens", actor: "ADMIN", requiresStrong: true, rules: [] }
};

module.exports = { ACTION_POLICIES };
