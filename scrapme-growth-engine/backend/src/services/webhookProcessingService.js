'use strict';

const MessageLog = require('../models/MessageLog');
const WebhookEvent = require('../models/WebhookEvent');
const preferenceService = require('./preferenceService');
const { getProvider } = require('../providers/providerRegistry');

/**
 * webhookProcessingService — Idempotent ingestion and processing of provider webhook events.
 *
 * Ingestion (ingestWebhook):
 *   1. Resolves the provider via providerRegistry
 *   2. Validates the request signature using the provider's validateWebhookSignature()
 *   3. Stores a WebhookEvent record with processed: false
 *   4. Returns the stored event
 *
 * Processing (processWebhookEvent):
 *   1. Checks the processed flag — skips if already done (idempotent)
 *   2. Dispatches to the appropriate handler by eventType
 *   3. Stamps processedAt and processed: true on success
 *   4. On handler error: stamps processingError, does NOT re-throw
 *
 * Phase 5: ingestWebhook returns a 501-equivalent object because NullProvider
 * always returns false from validateWebhookSignature(). No real webhook can
 * be ingested in Phase 5.
 */

/**
 * Ingest a raw provider webhook request.
 *
 * @param {string} providerName  e.g. 'sendgrid', 'twilio', 'whatsapp_cloud'
 * @param {import('express').Request} req  Express request (body + headers for signature)
 * @returns {Promise<{ ingested: boolean, webhookEvent?: Object, reason?: string }>}
 */
async function ingestWebhook(providerName, req) {
  if (!providerName || typeof providerName !== 'string') {
    return { ingested: false, reason: 'missing_provider' };
  }

  // Validate provider name against a strict allowlist to prevent arbitrary provider injection
  const SUPPORTED_PROVIDERS = WebhookEvent.WEBHOOK_PROVIDERS || ['sendgrid', 'twilio', 'whatsapp_cloud', 'fcm', 'null'];
  if (!SUPPORTED_PROVIDERS.includes(providerName.toLowerCase())) {
    return { ingested: false, reason: `unsupported_provider: ${providerName}` };
  }

  let provider;
  try {
    provider = getProvider(
      // Map provider name to channel for registry lookup
      _providerToChannel(providerName)
    );
  } catch (_err) {
    return { ingested: false, reason: 'provider_resolution_failed' };
  }

  // Validate signature — Phase 5: NullProvider always returns false
  const isValid = provider.validateWebhookSignature(req);
  if (!isValid) {
    return { ingested: false, reason: 'invalid_signature' };
  }

  // Parse the event
  const parsed = provider.parseWebhookEvent(req);

  // Build idempotency key
  const timestamp = Date.now();
  const idempotencyKey = [
    providerName,
    parsed.eventType || 'unknown',
    parsed.providerMessageId || 'no_msg_id',
    timestamp,
  ].join(':');

  // Strip authentication headers from raw payload before storage
  const safePayload = _stripSensitiveHeaders(req.body);

  let webhookEvent;
  try {
    webhookEvent = await WebhookEvent.create({
      provider: providerName,
      eventType: parsed.eventType,
      providerMessageId: parsed.providerMessageId || null,
      rawPayload: safePayload,
      idempotencyKey,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate idempotency key — already ingested
      webhookEvent = await WebhookEvent.findOne({ idempotencyKey });
      return { ingested: false, reason: 'duplicate_event', webhookEvent };
    }
    throw err;
  }

  return { ingested: true, webhookEvent };
}

/**
 * Process a stored WebhookEvent, updating MessageLog and preference records.
 * This function is idempotent — calling it twice on the same event is safe.
 *
 * @param {Object} webhookEvent  WebhookEvent Mongoose document
 * @returns {Promise<{ processed: boolean, skipped?: boolean, reason?: string }>}
 */
async function processWebhookEvent(webhookEvent) {
  if (!webhookEvent) {
    throw new Error('webhookEvent is required');
  }

  // Idempotency: skip if already processed
  if (webhookEvent.processed) {
    return { processed: false, skipped: true, reason: 'already_processed' };
  }

  try {
    await _handleWebhookEvent(webhookEvent);

    // Mark as processed
    await WebhookEvent.updateOne(
      { _id: webhookEvent._id },
      { $set: { processed: true, processedAt: new Date(), processingError: { code: null, message: null } } }
    );
    return { processed: true };

  } catch (handlerErr) {
    // Log the error but do not re-throw — ingest acknowledgement must succeed
    const safeMessage = String(handlerErr.message || 'Unknown error').slice(0, 500);
    console.error('[webhookProcessingService] Handler error:', {
      webhookEventId: webhookEvent._id,
      eventType: webhookEvent.eventType,
      error: safeMessage,
    });

    await WebhookEvent.updateOne(
      { _id: webhookEvent._id },
      {
        $set: {
          'processingError.code': handlerErr.code || 'HANDLER_ERROR',
          'processingError.message': safeMessage,
        },
      }
    );
    return { processed: false, reason: safeMessage };
  }
}

// ── Private Handlers ──────────────────────────────────────────

async function _handleWebhookEvent(webhookEvent) {
  const { eventType, providerMessageId } = webhookEvent;

  // Find associated MessageLog if we have a providerMessageId
  let messageLog = null;
  if (providerMessageId) {
    messageLog = await MessageLog.findOne({ providerMessageId });
  }

  switch (eventType) {
    case 'delivered':
      if (messageLog) {
        await MessageLog.updateOne(
          { _id: messageLog._id },
          {
            $set: { status: 'delivered', deliveredAt: new Date() },
            $push: { webhookEventIds: webhookEvent._id },
          }
        );
      }
      break;

    case 'opened':
      if (messageLog) {
        await MessageLog.updateOne(
          { _id: messageLog._id },
          {
            $set: { status: 'opened', openedAt: new Date() },
            $push: { webhookEventIds: webhookEvent._id },
          }
        );
      }
      break;

    case 'clicked':
      if (messageLog) {
        await MessageLog.updateOne(
          { _id: messageLog._id },
          {
            $set: { status: 'clicked', clickedAt: new Date() },
            $push: { webhookEventIds: webhookEvent._id },
          }
        );
      }
      break;

    case 'bounced':
      if (messageLog) {
        await MessageLog.updateOne(
          { _id: messageLog._id },
          {
            $set: {
              status: 'bounced',
              'error.code': 'BOUNCED',
              'error.message': webhookEvent.rawPayload && webhookEvent.rawPayload.reason
                ? String(webhookEvent.rawPayload.reason).slice(0, 255)
                : 'Email bounced',
            },
            $push: { webhookEventIds: webhookEvent._id },
          }
        );
      }
      break;

    case 'failed':
      if (messageLog) {
        await MessageLog.updateOne(
          { _id: messageLog._id },
          {
            $set: {
              status: 'failed',
              'error.code': 'PROVIDER_DELIVERY_FAILED',
              'error.message': 'Provider reported delivery failure',
            },
            $push: { webhookEventIds: webhookEvent._id },
          }
        );
      }
      break;

    case 'unsubscribed':
    case 'spam_report': {
      // Opt the customer out of the channel's marketing messages
      if (messageLog && messageLog.customerId) {
        const reason = eventType === 'spam_report' ? 'spam_complaint' : 'unsubscribe_link';
        await preferenceService.optOut(
          messageLog.customerId,
          messageLog.channel,
          'marketing',
          'webhook',
          reason
        );
        if (messageLog) {
          await MessageLog.updateOne(
            { _id: messageLog._id },
            {
              $set: { status: 'unsubscribed' },
              $push: { webhookEventIds: webhookEvent._id },
            }
          );
        }
      }
      break;
    }

    case 'deferred':
      // Deferred = temporary delay by receiving server; no action required
      if (messageLog) {
        await MessageLog.updateOne(
          { _id: messageLog._id },
          { $push: { webhookEventIds: webhookEvent._id } }
        );
      }
      break;

    default:
      console.warn(`[webhookProcessingService] Unhandled event type: ${eventType}`);
  }
}

/**
 * Map a provider name to a channel string for providerRegistry lookup.
 */
function _providerToChannel(providerName) {
  const map = {
    sendgrid: 'email',
    twilio: 'sms',
    twilio_sms: 'sms',
    whatsapp_cloud: 'whatsapp',
    fcm: 'push',
    null: 'email', // NullProvider handles all channels; use 'email' as default for registry
  };
  return map[providerName.toLowerCase()] || 'email';
}

/**
 * Remove sensitive fields from an incoming webhook payload before storage.
 * This prevents auth tokens or HMAC signatures from being persisted in the DB.
 */
function _stripSensitiveHeaders(body) {
  if (!body || typeof body !== 'object') return body;
  // Shallow clone — we don't want to mutate the original request body
  const safe = Object.assign({}, body);
  const sensitiveKeys = ['signature', 'authorization', 'x-twilio-signature', 'x-sendgrid-signature', 'token', 'secret'];
  for (const key of sensitiveKeys) {
    if (Object.prototype.hasOwnProperty.call(safe, key)) {
      safe[key] = '[redacted]';
    }
  }
  return safe;
}

module.exports = {
  ingestWebhook,
  processWebhookEvent,
};
