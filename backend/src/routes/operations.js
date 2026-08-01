const express = require('express');
const router = express.Router();

const {
  saveCustomerCoordinates,
  partnerLogin,
  partnerLogout,
  getMe,
  getAssignedOrders,
  getOrderDetails,
  completePickupOrder,
  addExtraDevice,
  updateGps,
  uploadImage,
  getWarehouseOrders,
  verifyWarehouseOrder,
  adminGetPartners,
  adminCreatePartner,
  adminUpdatePartner,
  adminAssignOrder,
  adminGetPerformanceDashboard,
  adminGetLiveLocations,
  adminGetOrderByRequestId,
  updateDutyStatus,
  cancelOrder,
  getPartnerStats,
  adminGetPartnerProfile,
  adminGetOrderDetails,
  adminGetAnalytics
} = require('../controllers/operationsController');

const { operationsProtect } = require('../middleware/operationsAuth');
const { adminProtect } = require('../middleware/adminAuth');
const { issueSseSession, requireSseSession } = require('../middleware/sseAuth');
const { sanitizeInput } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');

// Apply sanitization to all operations routes if validation middleware supports it
if (sanitizeInput) {
  router.use(sanitizeInput);
}

/* ─── PUBLIC ROUTES ───────────────────────────────── */
router.post('/auth/login', authLimiter, partnerLogin);
router.post('/events/session', issueSseSession);

// Real-time Event Stream (SSE)
router.get('/events', requireSseSession, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(': heartbeat\n\n');

  const keepAlive = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      clearInterval(keepAlive);
    }
  }, 20000);

  const eventBus = require('../utils/eventBus');
  eventBus.registerClient(res, req.ssePrincipal);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/* ─── PARTNER/WAREHOUSE AUTH ROUTES ───────────────── */
router.get('/auth/me', operationsProtect, getMe);
router.post('/auth/logout', operationsProtect, partnerLogout);
router.post('/auth/duty', operationsProtect, updateDutyStatus);
router.post('/gps/update', operationsProtect, updateGps);
router.post('/upload', operationsProtect, uploadImage);

// Partner Orders
router.get('/orders', operationsProtect, getAssignedOrders);
router.get('/orders/stats', operationsProtect, getPartnerStats);
router.get('/orders/:id', operationsProtect, getOrderDetails);
router.post('/orders/:id/coordinates', operationsProtect, saveCustomerCoordinates);
router.post('/orders/:id/cancel', operationsProtect, cancelOrder);
router.post('/orders/:id/pickup', operationsProtect, completePickupOrder);
router.post('/orders/:id/device', operationsProtect, addExtraDevice);

// Warehouse Portal
router.get('/warehouse/orders', operationsProtect, getWarehouseOrders);
router.post('/warehouse/orders/:id/verify', operationsProtect, verifyWarehouseOrder);

/* ─── ADMIN CONSOLE ROUTES (Admin protected) ──────── */
router.get('/admin/partners', adminProtect, adminGetPartners);
router.post('/admin/partners', adminProtect, adminCreatePartner);
router.put('/admin/partners/:id', adminProtect, adminUpdatePartner);
router.post('/admin/assign', adminProtect, adminAssignOrder);
router.get('/admin/performance', adminProtect, adminGetPerformanceDashboard);
router.get('/admin/locations', adminProtect, adminGetLiveLocations);
router.get('/admin/orders/request/:requestId', adminProtect, adminGetOrderByRequestId);
router.get('/admin/partners/:id/profile', adminProtect, adminGetPartnerProfile);
router.get('/admin/orders/:id', adminProtect, adminGetOrderDetails);
router.get('/admin/analytics', adminProtect, adminGetAnalytics);
router.post('/admin/orders/:id/cancel', adminProtect, cancelOrder);

module.exports = router;
