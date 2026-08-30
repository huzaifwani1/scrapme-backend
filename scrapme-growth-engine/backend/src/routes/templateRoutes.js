'use strict';

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const integrationAuth = require('../middleware/integrationAuth');
const controller = require('../controllers/templateController');

// All template endpoints require integration authentication
router.use(integrationAuth);

// GET /api/templates
router.get('/', controller.listTemplates);

// GET /api/templates/:id
router.get('/:id', controller.getTemplate);

// POST /api/templates
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('name is required'),
    body('slug').notEmpty().matches(/^[a-z0-9_-]+$/).withMessage('slug must be lowercase alphanumeric with underscores/hyphens'),
    body('channel').notEmpty().isIn(['email', 'whatsapp', 'sms', 'push']).withMessage('channel must be one of: email, whatsapp, sms, push'),
    body('content.body').notEmpty().withMessage('content.body is required'),
  ],
  validateRequest,
  controller.createTemplate
);

// PUT /api/templates/:id
router.put(
  '/:id',
  [
    body('content.body').optional().notEmpty().withMessage('content.body cannot be empty if provided'),
  ],
  validateRequest,
  controller.updateTemplate
);

// DELETE /api/templates/:id (soft-delete / archive)
router.delete('/:id', controller.archiveTemplate);

// POST /api/templates/:id/preview
router.post('/:id/preview', controller.previewTemplate);

module.exports = router;
