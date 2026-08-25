const express = require('express');
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const integrationAuth = require('../middleware/integrationAuth');
const { runSync } = require('../controllers/integrationController');

const router = express.Router();

router.post('/scrapme/sync', integrationAuth, [
  body('scope').optional().isIn(['customers', 'requests', 'pickup_orders', 'all'])
    .withMessage('scope must be customers, requests, pickup_orders, or all'),
  body('dryRun').optional().isBoolean().withMessage('dryRun must be a boolean'),
], validateRequest, runSync);

module.exports = router;
