const express = require('express');
const { body } = require('express-validator');
const integrationAuth = require('../middleware/integrationAuth');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/segmentationController');

const router = express.Router();
router.use(integrationAuth);
router.post('/refresh', [
  body('scope').optional().isIn(['all', 'customer', 'batch']).withMessage('scope must be all, customer, or batch'),
  body('customerId').optional().isMongoId().withMessage('customerId must be valid'),
  body('customerIds').optional().isArray().withMessage('customerIds must be an array'),
], validateRequest, controller.refresh);
router.get('/summary', controller.summary);
router.get('/', controller.list);

module.exports = router;
