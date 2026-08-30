'use strict';
const MessageIntent = require('../models/MessageIntent');
const messageDispatchService = require('../services/messageDispatchService');
const asyncHandler = require('../utils/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {}; ['customerId', 'status', 'channel', 'automationId'].forEach((key) => { if (req.query[key]) filter[key] = req.query[key]; });
  const [data, total] = await Promise.all([MessageIntent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-__v'), MessageIntent.countDocuments(filter)]);
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
exports.simulate = asyncHandler(async (req, res) => {
  const intent = await messageDispatchService.createIntent({ ...req.body, forceDryRun: true, metadata: { ...(req.body.metadata || {}), simulation: true } });
  res.status(201).json({ success: true, simulation: true, data: intent });
});
