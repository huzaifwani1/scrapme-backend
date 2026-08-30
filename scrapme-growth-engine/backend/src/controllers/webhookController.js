'use strict';

const asyncHandler = require('../utils/asyncHandler');
const webhookProcessingService = require('../services/webhookProcessingService');
const WebhookEvent = require('../models/WebhookEvent');

/**
 * POST /api/webhooks/:provider
 *
 * Accepts incoming webhook notifications from messaging providers.
 * Provider signature verification is performed BEFORE trusting the body.
 *
 * Phase 5: All calls return 501 because NullProvider.validateWebhookSignature()
 * always returns false, causing ingestWebhook() to return { ingested: false, reason: 'invalid_signature' }.
 */
exports.ingestProviderWebhook = asyncHandler(async (req, res) => {
  const provider = (req.params.provider || '').toLowerCase().trim();

  if (!provider) {
    return res.status(400).json({ success: false, error: 'Provider name is required in the URL path' });
  }

  const result = await webhookProcessingService.ingestWebhook(provider, req);

  if (!result.ingested) {
    if (result.reason === 'unsupported_provider' || result.reason && result.reason.startsWith('unsupported_provider')) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        reason: result.reason,
      });
    }

    if (result.reason === 'invalid_signature' || result.reason === 'provider_resolution_failed') {
      // Phase 5: no live providers are configured
      return res.status(501).json({
        success: false,
        error: 'Webhook signature verification is not configured for this provider in the current phase',
        phase: 5,
      });
    }

    if (result.reason === 'duplicate_event') {
      // Duplicate received — acknowledge to provider (they will stop retrying)
      return res.status(200).json({ success: true, duplicate: true });
    }

    return res.status(400).json({ success: false, error: result.reason || 'Ingestion failed' });
  }

  // Process synchronously. Phase 5 deliberately has no background worker.
  if (result.webhookEvent) {
    await webhookProcessingService.processWebhookEvent(result.webhookEvent);
  }

  return res.status(200).json({ success: true, webhookEventId: result.webhookEvent && result.webhookEvent._id });
});

/**
 * GET /api/webhooks/events — List ingested webhook events (admin/debug use)
 */
exports.listWebhookEvents = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.provider) filter.provider = req.query.provider;
  if (req.query.eventType) filter.eventType = req.query.eventType;
  if (req.query.processed !== undefined) filter.processed = req.query.processed === 'true';

  const [events, total] = await Promise.all([
    WebhookEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-rawPayload -__v'),
    WebhookEvent.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: events,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});
