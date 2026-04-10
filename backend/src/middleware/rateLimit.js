const rateLimit = require('express-rate-limit');

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * General rate limiter for non-sensitive API endpoints
 * Development: 5000 requests per 15 minutes (much higher for testing)
 * Production: 200 requests per 15 minutes
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 5000 : 200, // Much higher limit for development testing
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for authentication endpoints
 * Development: 200 requests per 15 minutes (higher for testing)
 * Production: 20 requests per 15 minutes
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 200 : 20, // Higher limit for development testing
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

/**
 * Admin login rate limiter
 * Development: 100 requests per 15 minutes (higher for testing)
 * Production: 10 requests per 15 minutes
 */
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100 : 10, // Higher limit for development testing
    message: {
        success: false,
        message: 'Too many admin login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

/**
 * Password reset rate limiter
 * Development: 50 requests per hour (higher for testing)
 * Production: 10 requests per hour
 */
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDevelopment ? 50 : 10, // Higher limit for development testing
    message: {
        success: false,
        message: 'Too many password reset attempts, please try again after 1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    generalLimiter,
    authLimiter,
    adminLoginLimiter,
    passwordResetLimiter
};