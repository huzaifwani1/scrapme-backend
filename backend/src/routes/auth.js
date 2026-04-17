const express = require('express');
const router = express.Router();
const { register, login, me, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const {
    sanitizeInput,
    validateRegister,
    validateLogin,
    validateForgotPassword,
    validateResetPassword
} = require('../middleware/validate');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimit');

// Apply sanitization to all routes
router.use(sanitizeInput);

// Apply rate limiting to authentication endpoints
router.post('/register', authLimiter, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);
router.get('/me', protect, me);
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, forgotPassword);
router.post('/reset-password', passwordResetLimiter, validateResetPassword, resetPassword);

module.exports = router;
