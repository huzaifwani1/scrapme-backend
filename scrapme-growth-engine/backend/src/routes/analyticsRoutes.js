const express = require('express');
const router = express.Router();
const integrationAuth = require('../middleware/integrationAuth');
const controller = require('../controllers/analyticsController');

// All analytics endpoints require integration authentication
router.use(integrationAuth);

router.get('/overview', controller.getOverview);
router.get('/acquisition', controller.getAcquisition);
router.get('/funnel', controller.getFunnel);
router.get('/lifecycle', controller.getLifecycle);
router.get('/revenue', controller.getRevenue);
router.get('/retention', controller.getRetention);
router.get('/campaigns', controller.getCampaigns);

module.exports = router;
