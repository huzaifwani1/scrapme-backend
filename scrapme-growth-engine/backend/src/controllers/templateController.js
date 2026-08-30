'use strict';

const MessageTemplate = require('../models/MessageTemplate');
const templateService = require('../services/templateService');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/templates
 */
exports.listTemplates = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = { parentId: null }; // Only canonical (non-archived-version) documents
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.messageType) filter.messageType = req.query.messageType;

  const [templates, total] = await Promise.all([
    MessageTemplate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v'),
    MessageTemplate.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: templates,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/templates/:id
 */
exports.getTemplate = asyncHandler(async (req, res) => {
  const template = await MessageTemplate.findById(req.params.id).select('-__v');
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  res.json({ success: true, data: template });
});

/**
 * POST /api/templates
 */
exports.createTemplate = asyncHandler(async (req, res) => {
  const validation = templateService.validateTemplateDefinition(req.body);
  if (!validation.valid) return res.status(400).json({ success: false, error: 'Invalid template variables', details: validation });
  const template = await MessageTemplate.create(req.body);
  res.status(201).json({ success: true, data: template });
});

/**
 * PUT /api/templates/:id
 * Updates template content and creates a historical version clone.
 */
exports.updateTemplate = asyncHandler(async (req, res) => {
  const template = await MessageTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  if (template.parentId !== null) {
    return res.status(400).json({ success: false, error: 'Cannot update a historical template version. Update the canonical template instead.' });
  }
  const validation = templateService.validateTemplateDefinition({ ...template.toObject(), ...req.body, content: { ...template.content.toObject(), ...(req.body.content || {}) } });
  if (!validation.valid) return res.status(400).json({ success: false, error: 'Invalid template variables', details: validation });

  const { updated, historicalClone } = await templateService.createNewVersion(template, req.body);
  res.json({ success: true, data: updated, versionCloneId: historicalClone._id });
});

/**
 * DELETE /api/templates/:id
 * Archives the template (soft-delete).
 */
exports.archiveTemplate = asyncHandler(async (req, res) => {
  const template = await MessageTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  template.status = 'archived';
  await template.save();
  res.json({ success: true, data: template });
});

/**
 * POST /api/templates/:id/preview
 * Renders a template with provided sample data. Never sends.
 */
exports.previewTemplate = asyncHandler(async (req, res) => {
  const template = await MessageTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  const sampleData = req.body.variables || req.body.sampleData || {};
  const rendered = templateService.renderTemplate(template, sampleData);

  res.json({
    success: true,
    templateId: template._id,
    slug: template.slug,
    channel: template.channel,
    renderedSubject: rendered.renderedSubject,
    renderedBody: rendered.renderedBody,
    missingVariables: rendered.missingVariables,
  });
});
