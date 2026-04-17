const rateLimit = require('express-rate-limit');

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * General rate limiter for all API endpoints
 * Development: 5000 requests per 15 minutes (very high for testing)
 * Production: 1000 requests per 15 minutes (high for production)
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 5000 : 1000, // Very high limits
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
 * Production: 500 requests per 15 minutes (very high)
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 500, // Very high production limit
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
 * Development: 100 requests per 15 minutes
 * Production: 50 requests per 15 minutes (very high)
 */
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100 : 50, // Very high production limit
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
 * Development: 100 requests per hour
 * Production: 50 requests per hour (very high)
 */
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDevelopment ? 100 : 50, // Very high production limit
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