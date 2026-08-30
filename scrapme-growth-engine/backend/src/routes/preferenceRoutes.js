'use strict';
const express = require('express'); const { body, param } = require('express-validator');
const integrationAuth = require('../middleware/integrationAuth'); const validateRequest = require('../middleware/validateRequest'); const controller = require('../controllers/preferenceController');
const router = express.Router(); router.use(integrationAuth);
router.get('/:customerId', [param('customerId').isMongoId()], validateRequest, controller.getPreferences);
const checks = [param('customerId').isMongoId(), body('channel').isIn(['email','whatsapp','sms','push']), body('messageType').isIn(['marketing','transactional','all']), body('source').optional().isIn(['customer_request','admin','import','webhook','system'])];
router.post('/:customerId/opt-in', checks, validateRequest, controller.optIn);
router.post('/:customerId/opt-out', checks, validateRequest, controller.optOut);
module.exports = router;
