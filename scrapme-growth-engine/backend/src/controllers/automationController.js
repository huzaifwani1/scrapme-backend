const Automation = require('../models/Automation');
const Customer = require('../models/Customer');
const CustomerEvent = require('../models/CustomerEvent');
const AutomationExecution = require('../models/AutomationExecution');
const automationService = require('../services/automationService');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/automations
 */
exports.listAutomations = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [automations, total] = await Promise.all([
    Automation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Automation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: automations,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/automations/:id
 */
exports.getAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id).select('-__v');
  if (!automation) {
    return res.status(404).json({ success: false, error: 'Automation not found' });
  }
  res.json({ success: true, data: automation });
});

/**
 * POST /api/automations
 */
exports.createAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.create(req.body);
  res.status(201).json({ success: true, data: automation });
});

/**
 * POST /api/automations/:id/test
 * Test an automation against a supplied customer/event or safe test fixture.
 */
exports.testAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id);
  if (!automation) {
    return res.status(404).json({ success: false, error: 'Automation not found' });
  }

  let customer = req.body.customer;
  if (!customer && req.body.customerId) {
    customer = await Customer.findById(req.body.customerId);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
  }

  if (!customer) {
    return res.status(400).json({ success: false, error: 'Customer data or customerId is required' });
  }

  let event = req.body.event;
  if (!event && req.body.eventId) {
    event = await CustomerEvent.findById(req.body.eventId);
  }

  const result = await automationService.evaluateAutomation({ automation, customer, event });
  res.json({
    success: true,
    eligible: result.eligible,
    skipReason: result.skipReason,
    actionResults: result.actionResults || []
  });
});

/**
 * POST /api/automations/:id/preview
 * Returns eligible and skipped customers and generated actions without committing anything.
 */
exports.previewAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id);
  if (!automation) {
    return res.status(404).json({ success: false, error: 'Automation not found' });
  }

  const eligible = [];
  const skipped = [];

  const cursor = Customer.find().cursor({ batchSize: 100 });
  for (let customer = await cursor.next(); customer != null; customer = await cursor.next()) {
    const result = await automationService.evaluateAutomation({ automation, customer });
    if (result.eligible) {
      eligible.push({
        customerId: customer._id,
        email: customer.email,
        actions: result.actionResults
      });
    } else {
      skipped.push({
        customerId: customer._id,
        reason: result.skipReason
      });
    }
  }

  res.json({
    success: true,
    automationId: automation._id,
    eligibleCount: eligible.length,
    skippedCount: skipped.length,
    eligible,
    skipped
  });
});

/**
 * POST /api/automations/:id/execute-preview
 * Generate AutomationExecution records in dry-run mode only. No real external actions.
 */
exports.executePreviewAutomation = asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id);
  if (!automation) {
    return res.status(404).json({ success: false, error: 'Automation not found' });
  }

  const executionsCreated = [];

  const cursor = Customer.find().cursor({ batchSize: 100 });
  for (let customer = await cursor.next(); customer != null; customer = await cursor.next()) {
    const execution = await automationService.executeAutomation({
      automation,
      customer,
      event: null,
      ignoreDelay: true,
      now: new Date()
    });
    executionsCreated.push(execution._id);
  }

  res.json({
    success: true,
    automationId: automation._id,
    executionsCount: executionsCreated.length,
    executionIds: executionsCreated
  });
});

/**
 * GET /api/automation-executions
 * Paginated list of execution logs.
 */
exports.listAutomationExecutions = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.automationId) filter.automationId = req.query.automationId;
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.status) filter.status = req.query.status;

  const [executions, total] = await Promise.all([
    AutomationExecution.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    AutomationExecution.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: executions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});
