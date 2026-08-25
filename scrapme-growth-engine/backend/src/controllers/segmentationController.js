const CustomerSegment = require('../models/CustomerSegment');
const asyncHandler = require('../utils/asyncHandler');
const { refreshSegments } = require('../services/segmentationService');

exports.refresh = asyncHandler(async (req, res) => {
  const result = await refreshSegments(req.body || {});
  res.json({ success: true, data: result });
});

exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (req.query.segmentKey) filter.segmentKey = req.query.segmentKey;
  if (req.query.customerId) filter.customerId = req.query.customerId;
  const [segments, total] = await Promise.all([
    CustomerSegment.find(filter).sort({ calculatedAt: -1 }).skip((page - 1) * limit).limit(limit).populate('customerId', 'name email phone customerStatus totalOrders completedOrders totalRevenue acquisitionSource').select('-__v'),
    CustomerSegment.countDocuments(filter),
  ]);
  res.json({ success: true, data: segments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

exports.summary = asyncHandler(async (_req, res) => {
  const summary = await CustomerSegment.aggregate([{ $group: { _id: '$segmentKey', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  res.json({ success: true, data: Object.fromEntries(summary.map((item) => [item._id, item.count])) });
});
