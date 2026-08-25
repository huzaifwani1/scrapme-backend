const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/eventController');

// GET /api/events
router.get('/', controller.listEvents);

// POST /api/events
router.post(
  '/',
  [
    body('customerId').notEmpty().withMessage('customerId is required'),
    body('eventType').notEmpty().withMessage('eventType is required'),
  ],
  validateRequest,
  controller.createEvent
);

module.exports = router;
