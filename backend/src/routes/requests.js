const express = require('express');
const router = express.Router();
const { createRequest, getMyRequests } = require('../controllers/requestController');
const { protect } = require('../middleware/auth');
const { sanitizeInput, validateSellRequest } = require('../middleware/validate');

// Apply sanitization to all routes
router.use(sanitizeInput);

router.post('/', protect, validateSellRequest, createRequest);
router.get('/mine', protect, getMyRequests);

module.exports = router;
