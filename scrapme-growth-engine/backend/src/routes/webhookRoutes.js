'use strict';

const express = require('express');
const router = express.Router();
const integrationAuth = require('../middleware/integrationAuth');
const controller = require('../controllers/webhookController');

/**
 * Webhook routes — Phase 5
 *
 * POST /api/webhooks/:provider
 *   Accepts provider webhook notifications.
 *   Authentication: provider-specific signature verification (NOT integrationAuth).
 *   Phase 5: Returns 501 for all providers (NullProvider only).
 *
 * GET /api/webhooks/events
 *   Admin endpoint to inspect ingested webhook events.
 *   Authentication: integrationAuth (shared internal token).
 */

// ── Provider Webhook Ingestion ─────────────────────────────────────────────
// NOTE: This route intentionally does NOT use integrationAuth.
// Real providers (SendGrid, Twilio, Meta) use their own HMAC-based signatures,
// verified inside ingestWebhook() via provider.validateWebhookSignature(req).
// Adding integrationAuth here would break production webhook delivery.
router.post('/:provider', controller.ingestProviderWebhook);

// ── Admin: List Ingested Events ────────────────────────────────────────────
router.get('/events', integrationAuth, controller.listWebhookEvents);

module.exports = router;
