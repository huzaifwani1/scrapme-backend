const Automation = require('../models/Automation');
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
