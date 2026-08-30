'use strict';

const asyncHandler = require('../utils/asyncHandler');
const preferenceService = require('../services/preferenceService');
const CommunicationPreference = require('../models/CommunicationPreference');

/**
 * GET /api/preferences/:customerId
 */
exports.getPreferences = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const prefs = await preferenceService.getPreferences(customerId);
  res.json({ success: true, data: prefs, customerId });
});

/**
 * POST /api/preferences/:customerId/opt-out
 * Body: { channel, messageType, source?, reason? }
 */
exports.optOut = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { channel, messageType, source = 'admin', reason = null } = req.body;

  const pref = await preferenceService.optOut(customerId, channel, messageType, source, reason);
  res.json({ success: true, data: pref });
});

/**
 * POST /api/preferences/:customerId/opt-in
 * Body: { channel, messageType, source? }
 */
exports.optIn = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { channel, messageType, source = 'admin' } = req.body;

  const pref = await preferenceService.optIn(customerId, channel, messageType, source);
  res.json({ success: true, data: pref });
});
