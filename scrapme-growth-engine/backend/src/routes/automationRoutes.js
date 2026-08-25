const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/automationController');

// GET /api/automations
router.get('/', controller.listAutomations);

// GET /api/automations/:id
router.get('/:id', controller.getAutomation);

// POST /api/automations
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Automation name is required'),
    body('trigger.type').notEmpty().withMessage('Trigger type is required'),
  ],
  validateRequest,
  controller.createAutomation
);

module.exports = router;
