const MessageLog = require('../models/MessageLog');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/message-logs
 * List message logs with pagination and filters.
 */
exports.listMessageLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.campaignId) filter.campaignId = req.query.campaignId;
  if (req.query.automationId) filter.automationId = req.query.automationId;
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.status) filter.status = req.query.status;

  const [logs, total] = await Promise.all([
    MessageLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    MessageLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * POST /api/message-logs
 * Create a message log entry.
 */
exports.createMessageLog = asyncHandler(async (req, res) => {
  const log = await MessageLog.create(req.body);
  res.status(201).json({ success: true, data: log });
});
