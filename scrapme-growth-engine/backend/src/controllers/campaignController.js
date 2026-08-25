const Campaign = require('../models/Campaign');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/campaigns
 */
exports.listCampaigns = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.channel) filter.channel = req.query.channel;

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Campaign.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: campaigns,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/campaigns/:id
 */
exports.getCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findById(req.params.id).select('-__v');
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }
  res.json({ success: true, data: campaign });
});

/**
 * POST /api/campaigns
 */
exports.createCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.create(req.body);
  res.status(201).json({ success: true, data: campaign });
});
