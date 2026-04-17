const express = require('express');
const router = express.Router();
const { adminLogin, getAllRequests, updateStatus, getMessages, sendMessage, getUserCount } = require('../controllers/adminController');
const { adminProtect } = require('../middleware/adminAuth');
const {
    sanitizeInput,
    validateAdminLogin,
    validateStatusUpdate,
    validateSendMessage
} = require('../middleware/validate');
const { adminLoginLimiter } = require('../middleware/rateLimit');

// Apply sanitization to all routes
router.use(sanitizeInput);

// Apply strict rate limiting to admin login
router.post('/login', adminLoginLimiter, validateAdminLogin, adminLogin);
router.get('/requests', adminProtect, getAllRequests);
router.put('/requests/:id/status', adminProtect, validateStatusUpdate, updateStatus);
router.get('/messages/:requestId', adminProtect, getMessages);
router.post('/messages/:requestId', adminProtect, validateSendMessage, sendMessage);
router.get('/users/count', adminProtect, getUserCount);

module.exports = router;
