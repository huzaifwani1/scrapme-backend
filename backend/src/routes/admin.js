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
  adminGetUsers,
  adminGetUsersStats,
  adminGetUserDetails,
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

// User Data Module
router.get('/users',                       adminProtect, adminGetUsers);
router.get('/users/stats',                 adminProtect, adminGetUsersStats);
router.get('/users/:id',                   adminProtect, adminGetUserDetails);

// Commission Settings Module
const {
  getCommissionSettings,
  addCommissionSetting,
  updateCommissionSetting,
  toggleCommissionSetting,
  deleteCommissionSetting,
  approveCommission
} = require('../controllers/commissionSettingsController');

router.get('/commission-settings', adminProtect, getCommissionSettings);
router.post('/commission-settings', adminProtect, addCommissionSetting);
router.put('/commission-settings/:id', adminProtect, updateCommissionSetting);
router.delete('/commission-settings/:id', adminProtect, deleteCommissionSetting);
router.post('/commission-settings/:id/toggle', adminProtect, toggleCommissionSetting);
router.post('/approve-commission', adminProtect, approveCommission);

module.exports = router;
