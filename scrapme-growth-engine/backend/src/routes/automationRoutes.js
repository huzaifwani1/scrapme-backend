const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/automationController');
const integrationAuth = require('../middleware/integrationAuth');

// Require integration authentication for ALL automation endpoints in EVERY environment
router.use(integrationAuth);

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

// POST /api/automations/:id/test
router.post('/:id/test', controller.testAutomation);

// POST /api/automations/:id/preview
router.post('/:id/preview', controller.previewAutomation);

// POST /api/automations/:id/execute-preview
router.post('/:id/execute-preview', controller.executePreviewAutomation);

module.exports = router;
