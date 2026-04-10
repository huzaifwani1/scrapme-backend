const { body, query, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Sanitize input to prevent NoSQL injection
 * More selective sanitization that preserves valid characters in emails and other fields
 */
const sanitizeInput = (req, res, next) => {
    // Sanitize req.body
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                // Remove MongoDB operators but preserve dots for emails and other valid uses
                // Only remove dots when they appear as part of MongoDB operator patterns
                // Simple approach: remove $ operators but keep dots
                req.body[key] = req.body[key].replace(/\$/g, '');
            }
        });
    }

    // Sanitize req.query
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].replace(/\$/g, '');
            }
        });
    }

    next();
};

/**
 * Validate registration input
 */
const validateRegister = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
        .escape(),

    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
        .withMessage('Password must be at least 6 characters and contain uppercase, lowercase, and number'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

/**
 * Validate login input
 */
const validateLogin = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password is required'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

/**
 * Validate forgot password input
 */
const validateForgotPassword = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

/**
 * Validate reset password input
 */
const validateResetPassword = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),

    body('code')
        .trim()
        .notEmpty().withMessage('Reset code is required')
        .isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits')
        .isNumeric().withMessage('Reset code must be numeric'),

    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

/**
 * Validate sell request input
 * Updated to match frontend fields and controller expectations
 */
const validateSellRequest = [
    body('brand')
        .trim()
        .notEmpty().withMessage('Phone brand is required')
        .isLength({ min: 2, max: 50 }).withMessage('Brand must be between 2 and 50 characters')
        .escape(),

    body('model')
        .trim()
        .notEmpty().withMessage('Phone model is required')
        .isLength({ min: 1, max: 50 }).withMessage('Model must be between 1 and 50 characters')
        .escape(),

    body('storage')
        .trim()
        .notEmpty().withMessage('Storage capacity is required')
        .matches(/^\d+GB$/).withMessage('Storage must be in format like "64GB", "128GB", etc.'),

    body('sellerName')
        .trim()
        .notEmpty().withMessage('Your name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
        .escape(),

    body('phone')
        .trim()
        .notEmpty().withMessage('Phone number is required')
        .matches(/^[\d\s\-\+\(\)]{10,20}$/).withMessage('Invalid phone number format'),

    body('address')
        .trim()
        .notEmpty().withMessage('Address is required')
        .isLength({ min: 5, max: 500 }).withMessage('Address must be between 5 and 500 characters')
        .escape(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

/**
 * Validate admin login input
 */
const validateAdminLogin = [
    body('username')
        .trim()
        .notEmpty().withMessage('Username is required')
        .escape(),

    body('password')
        .notEmpty().withMessage('Password is required'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

/**
 * Validate request status update
 */
const validateStatusUpdate = [
    param('id')
        .notEmpty().withMessage('Request ID is required')
        .custom(value => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid request ID'),

    body('status')
        .trim()
        .notEmpty().withMessage('Status is required')
        .isIn(['pending', 'evaluated', 'approved', 'completed', 'rejected']).withMessage('Invalid status value'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

/**
 * Validate message sending
 */
const validateSendMessage = [
    param('requestId')
        .notEmpty().withMessage('Request ID is required')
        .custom(value => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid request ID'),

    body('text')
        .trim()
        .notEmpty().withMessage('Message text is required')
        .isLength({ min: 1, max: 500 }).withMessage('Message must be between 1 and 500 characters')
        .escape(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
            });
        }
        next();
    }
];

module.exports = {
    sanitizeInput,
    validateRegister,
    validateLogin,
    validateForgotPassword,
    validateResetPassword,
    validateSellRequest,
    validateAdminLogin,
    validateStatusUpdate,
    validateSendMessage
};