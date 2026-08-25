const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/campaignController');

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

module.exports = router;
