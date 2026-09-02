const express = require('express');
const router = express.Router();
const integrationAuth = require('../middleware/integrationAuth');
const controller = require('../controllers/intelligenceController');

// All intelligence endpoints require integration authentication
router.use(integrationAuth);

router.get('/summary', controller.getSummary);
router.get('/opportunities', controller.getOpportunities);
router.get('/next-best-actions', controller.getNextBestActions);
router.get('/customers/:id', controller.getCustomerProfile);

module.exports = router;
