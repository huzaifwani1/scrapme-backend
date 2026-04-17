const rateLimit = require('express-rate-limit');

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * General rate limiter for all API endpoints
 * Development: 1000 requests per 15 minutes
 * Production: 500 requests per 15 minutes (increased from 100)
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 500, // Increased production limit
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true, // Don't count failed requests
});

/**
 * Rate limiter for authentication endpoints
 * Development: 1000 requests per 15 minutes
 * Production: 200 requests per 15 minutes (increased from 100)
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 200, // Increased production limit
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skipFailedRequests: true,
});

/**
 * Admin login rate limiter
 * Development: 50 requests per 15 minutes
 * Production: 20 requests per 15 minutes (increased from 3)
 */
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 50 : 20, // Increased production limit
    message: {
        success: false,
        message: 'Too many admin login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skipFailedRequests: true, // Don't count failed login attempts
});

/**
 * Password reset rate limiter
 * Development: 50 requests per hour
 * Production: 10 requests per hour (increased from 3)
 */
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDevelopment ? 50 : 10, // Increased production limit
    message: {
        success: false,
        message: 'Too many password reset attempts, please try again after 1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true, // Don't count failed requests
});

module.exports = {
    generalLimiter,
    authLimiter,
    adminLoginLimiter,
    passwordResetLimiter
};