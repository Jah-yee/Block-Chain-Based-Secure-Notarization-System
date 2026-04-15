const Joi = require('joi');

/**
 * 🛡️ [Hardening] Standardized Domain Validation Contract
 * Single Source of Truth for all domain-level validations.
 */

// 1. Core Regex Definitions (Hardened Structure)
const REGEX = {
    // Enforces: Start with letters, proper word structure, no trailing junk
    NAME: /^[A-Za-z]+([ .'-][A-Za-z]+)*$/,
    // Enforces: Valid standard email format with at least 2char TLD
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    // Enforces: Exactly 10 digits
    PHONE: /^[0-9]{10}$/,
    // Enforces: 6-20 alphanumeric characters
    ALPHA_NUMERIC: /^[A-Za-z0-9]{6,20}$/,
    // Enforces: Ethereum format
    WALLET: /^0x[a-fA-F0-9]{40}$/
};

// 2. User Validation Schema (Semantic & Technical)
const userSchema = Joi.object({
    fullName: Joi.string()
        .trim()
        .regex(REGEX.NAME)
        .required()
        .custom((value, helpers) => {
            // 🛡️ [Semantic] Prevent unrealistic name lengths/abuse
            const words = value.split(/\s+/);
            if (words.length > 4) {
                return helpers.message('Full name must be realistic (max 4 words)');
            }
            if (words.length < 2) {
                return helpers.message('Full name must include at least first and last name');
            }
            return value;
        })
        .messages({
            'string.empty': 'Full name is required',
            'string.pattern.base': 'Invalid name format. Use only letters and single spaces/hyphens.'
        }),
    email: Joi.string().trim().lowercase().regex(REGEX.EMAIL).required().messages({
        'string.empty': 'Email is required',
        'string.pattern.base': 'Invalid email format (e.g., user@example.com)'
    }),
    phone: Joi.string().trim().regex(REGEX.PHONE).optional().messages({
        'string.pattern.base': 'Phone number must be exactly 10 digits'
    }),
    nationalId: Joi.string().trim().regex(REGEX.ALPHA_NUMERIC).optional().messages({
        'string.pattern.base': 'National ID must be 6-20 alphanumeric characters'
    }),
    nationalIdText: Joi.string().trim().regex(REGEX.ALPHA_NUMERIC).optional(),
    license: Joi.string().trim().regex(REGEX.ALPHA_NUMERIC).optional().messages({
        'string.pattern.base': 'License ID must be 6-20 alphanumeric characters'
    }),
    walletAddress: Joi.string().trim().lowercase().regex(REGEX.WALLET).optional(),
    nonce: Joi.string().required().messages({
        'any.required': 'Authentication nonce is required'
    }),
    signature: Joi.string().required().messages({
        'any.required': 'Cryptographic signature is required'
    }),
    password: Joi.string().min(6).required(),
    faceDescriptor: Joi.string().optional(),
    nationalIdFile: Joi.any().optional(),
    version: Joi.string().valid('v1').optional(),
    backendChallenge: Joi.boolean().optional()
});

const loginSchema = Joi.object({
    email: Joi.string().trim().lowercase().regex(REGEX.EMAIL).required(),
    password: Joi.string().required(),
    nationalId: Joi.string().trim().regex(REGEX.ALPHA_NUMERIC).required().messages({
        'any.required': 'National ID is required for secure login',
        'string.pattern.base': 'National ID must be 6-20 alphanumeric characters'
    }),
    walletAddress: Joi.string().trim().lowercase().regex(REGEX.WALLET).required(),
    nonce: Joi.string().required(),
    signature: Joi.string().required(),
    signature_nonce: Joi.string().optional(), // Fallback for existing frontend
    version: Joi.string().valid('v1').optional(),
    backendChallenge: Joi.boolean().optional()
});

const notarySchema = Joi.object({
    fullName: Joi.string().trim().regex(REGEX.NAME).required(),
    email: Joi.string().trim().lowercase().regex(REGEX.EMAIL).required(),
    walletAddress: Joi.string().trim().lowercase().regex(REGEX.WALLET).optional(),
    phone: Joi.string().trim().regex(REGEX.PHONE).required(),
    license: Joi.string().trim().regex(REGEX.ALPHA_NUMERIC).required(),
    experience: Joi.number().integer().min(0).max(100).optional(),
    nationalId: Joi.string().trim().regex(REGEX.ALPHA_NUMERIC).required(),
    nationality: Joi.string().optional(),
    version: Joi.string().valid('v1').optional(),
    backendChallenge: Joi.boolean().optional()
});

// 3. Document Creation Schema
const documentCreateSchema = Joi.object({
    name: Joi.string().required(),
    type: Joi.string().required(),
    owner: Joi.number().integer().positive().optional()
});

// 4. Middleware Helper
/**
 * validateBody: Higher-order middleware for Joi validation
 */
const validateBody = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: false });
        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({ 
                status: 'error', 
                error: errorMessage 
            });
        }
        req.body = value;
        next();
    };
};

module.exports = {
    REGEX,
    userSchema,
    loginSchema,
    notarySchema,
    documentCreateSchema,
    validateBody
};
