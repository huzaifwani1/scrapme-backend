'use strict';
const express = require('express'); const { body } = require('express-validator');
const integrationAuth = require('../middleware/integrationAuth'); const validateRequest = require('../middleware/validateRequest'); const controller = require('../controllers/messageIntentController');
const router = express.Router(); router.use(integrationAuth);
router.get('/', controller.list);
router.post('/simulate', [body('customerId').isMongoId(), body('channel').isIn(['email','whatsapp','sms','push']), body('messageType').optional().isIn(['marketing','transactional']), body('templateSlug').notEmpty(), body('recipient').notEmpty()], validateRequest, controller.simulate);
module.exports = router;
