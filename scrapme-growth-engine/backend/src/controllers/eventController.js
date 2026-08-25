const CustomerEvent = require('../models/CustomerEvent');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/events
 * List events with pagination and optional filters.
 */
exports.listEvents = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.eventType) filter.eventType = req.query.eventType;

  const [events, total] = await Promise.all([
    CustomerEvent.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    CustomerEvent.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: events,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * POST /api/events
 * Record a new customer event.
 */
exports.createEvent = asyncHandler(async (req, res) => {
  const event = await CustomerEvent.create(req.body);
  res.status(201).json({ success: true, data: event });
});
