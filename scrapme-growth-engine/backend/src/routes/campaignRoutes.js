const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/campaignController');
const integrationAuth = require('../middleware/integrationAuth');
router.use(integrationAuth);

// GET /api/campaigns
router.get('/', controller.listCampaigns);

// GET /api/campaigns/:id
router.get('/:id', controller.getCampaign);

// POST /api/campaigns
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Campaign name is required'),
    body('type').notEmpty().withMessage('Campaign type is required'),
    body('channel').notEmpty().withMessage('Campaign channel is required'),
  ],
  validateRequest,
  controller.createCampaign
);
router.post('/:id/preview', controller.previewCampaign);
router.post('/:id/execute-preview', controller.executePreviewCampaign);
router.post('/:id/:transition(schedule|activate|pause|cancel)', (req,res,next)=>{req.params.transition={schedule:'scheduled',activate:'active',pause:'paused',cancel:'cancelled'}[req.params.transition]; next();}, controller.transitionCampaign);

module.exports = router;
