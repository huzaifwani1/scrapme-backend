const express = require('express');
const router = express.Router();
const controller = require('../controllers/automationController');
const integrationAuth = require('../middleware/integrationAuth');

// Require integration authentication for ALL automation-executions endpoints in EVERY environment
router.use(integrationAuth);

// GET /api/automation-executions
router.get('/', controller.listAutomationExecutions);

module.exports = router;
