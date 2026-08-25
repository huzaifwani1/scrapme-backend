const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/messageLogController');

// GET /api/message-logs
router.get('/', controller.listMessageLogs);

// POST /api/message-logs
router.post(
  '/',
  [
    body('customerId').notEmpty().withMessage('customerId is required'),
    body('channel').notEmpty().withMessage('channel is required'),
    body('recipient').notEmpty().withMessage('recipient is required'),
  ],
  validateRequest,
  controller.createMessageLog
);

module.exports = router;
