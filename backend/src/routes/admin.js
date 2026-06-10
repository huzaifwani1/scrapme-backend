const express = require('express');
const router  = express.Router();

const {
  adminLogin,
  getAllRequests,
  getDashboardStats,
  updateStatus,
  updateReviewed,
  updateAdminNotes,
  getMessages,
  sendMessage,
  getUserCount,
} = require('../controllers/adminController');

const { adminProtect }            = require('../middleware/adminAuth');
const { sanitizeInput, validateAdminLogin, validateStatusUpdate, validateSendMessage } = require('../middleware/validate');
const { adminLoginLimiter }       = require('../middleware/rateLimit');

// Apply sanitization to all routes
router.use(sanitizeInput);

// Auth
router.post('/login', adminLoginLimiter, validateAdminLogin, adminLogin);

// Requests — paginated + search + filter
router.get('/requests',                    adminProtect, getAllRequests);
router.put('/requests/:id/status',         adminProtect, validateStatusUpdate, updateStatus);
router.put('/requests/:id/reviewed',       adminProtect, updateReviewed);
router.put('/requests/:id/notes',          adminProtect, updateAdminNotes);

// Dashboard summary
router.get('/stats',                       adminProtect, getDashboardStats);

// Messages
router.get('/messages/:requestId',         adminProtect, getMessages);
router.post('/messages/:requestId',        adminProtect, validateSendMessage, sendMessage);

// Legacy
router.get('/users/count',                 adminProtect, getUserCount);

module.exports = router;
