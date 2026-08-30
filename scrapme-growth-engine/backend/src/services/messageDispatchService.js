'use strict';

const MessageIntent = require('../models/MessageIntent');
const MessageLog = require('../models/MessageLog');
const preferenceService = require('./preferenceService');
const templateService = require('./templateService');
const { getProvider } = require('../providers/providerRegistry');

// Retry backoff schedule (minutes per attempt index)
const RETRY_BACKOFF_MINUTES = [5, 30, 120]; // attempt 1, 2, 3

/**
 * messageDispatchService — Central dispatch orchestrator.
 *
 * Responsibilities:
 *   - Create MessageIntent records (with suppression pre-check and idempotency)
 *   - Dispatch intents to providers via providerRegistry
 *   - Create MessageLog records for every dispatch attempt
 *   - Handle provider errors and schedule retries
 *
 * Phase 5 invariant: DRY_RUN defaults to 'true', so:
 *   - createIntent() always stamps dryRun: true
 *   - dispatchIntent() short-circuits before any provider call
 *   - NullProvider is returned by providerRegistry in all cases
 */

/**
 * Create a MessageIntent, checking idempotency and suppression first.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.customerId
 * @param {string|ObjectId} [params.automationId]
 * @param {string|ObjectId} [params.executionId]
 * @param {string|ObjectId} [params.campaignId]
 * @param {string} params.channel         One of: email, whatsapp, sms, push
 * @param {string} [params.messageType]   'marketing' | 'transactional' (default: 'marketing')
 * @param {string} params.templateSlug
 * @param {Object} [params.templateVariables]
 * @param {string} params.recipient
 * @param {string} [params.idempotencyKey]
 * @param {Date}   [params.scheduledAt]
 * @param {Object} [params.metadata]
 * @returns {Promise<Object>}  The MessageIntent document
 */
async function createIntent(params) {
  const {
    customerId,
    automationId = null,
    executionId = null,
    campaignId = null,
    channel,
    messageType = 'marketing',
    templateSlug,
    templateVariables = {},
    recipient,
    idempotencyKey = null,
    scheduledAt = null,
    metadata = {}, forceDryRun = false,
  } = params;

  // ── Input Validation ──────────────────────────────────────────────────────
  if (!customerId) throw new Error('customerId is required');
  if (!channel) throw new Error('channel is required');
  if (!templateSlug) throw new Error('templateSlug is required');
  if (!recipient) throw new Error('recipient is required');

  // ── Idempotency Check ─────────────────────────────────────────────────────
  if (idempotencyKey) {
    const existing = await MessageIntent.findOne({ idempotencyKey });
    if (existing) {
      return existing;
    }
  }

  // ── Determine dryRun mode (stamped immutably at creation time) ────────────
  const dryRun = forceDryRun || process.env.DRY_RUN !== 'false';

  // ── Pre-dispatch Suppression Check ───────────────────────────────────────
  let status = 'pending';
  let suppressionReason = null;

  if (dryRun) {
    status = 'suppressed';
    suppressionReason = 'dry_run';
  } else {
    // Check customer preferences
    const optedIn = await preferenceService.isOptedIn(customerId, channel, messageType);
    if (!optedIn) {
      status = 'suppressed';
      suppressionReason = `opted_out (channel: ${channel}, type: ${messageType})`;
    }
  }

  // ── Create the Intent ─────────────────────────────────────────────────────
  const intent = await MessageIntent.create({
    customerId,
    automationId,
    executionId,
    campaignId,
    channel,
    messageType,
    templateSlug,
    templateVariables,
    recipient,
    status,
    suppressionReason,
    dryRun,
    idempotencyKey,
    scheduledAt,
    metadata,
  });

  return intent;
}

/**
 * Dispatch a MessageIntent to its channel provider.
 * Creates a MessageLog record for the attempt.
 *
 * This function must only be called when intent.dryRun === false and
 * intent.status === 'pending' | 'processing'.
 *
 * Phase 5: providerRegistry always returns NullProvider, so no real
 * message is ever sent.
 *
 * @param {Object} intent  MessageIntent Mongoose document
 * @returns {Promise<Object>}  The MessageLog document created for this attempt
 */
async function dispatchIntent(intent) {
  if (!intent) throw new Error('intent is required');

  // Safety guard: never dispatch a suppressed or already-dispatched intent
  if (intent.status === 'suppressed' || intent.status === 'cancelled') {
    throw new Error(`Cannot dispatch intent with status: ${intent.status}`);
  }
  if (intent.status === 'dispatched') {
    // Find and return existing log
    const existingLog = await MessageLog.findOne({ intentId: intent._id }).sort({ createdAt: -1 });
    if (existingLog) return existingLog;
  }

  // Mark as processing (prevents concurrent dispatch)
  await MessageIntent.updateOne({ _id: intent._id }, { $set: { status: 'processing' } });

  // Render template
  let renderedSubject = '';
  let renderedBody = '';
  let templateId = null;

  try {
    const template = await templateService.getTemplateBySlug(intent.templateSlug, intent.channel);
    if (template) {
      templateId = template._id;
      const rendered = templateService.renderTemplate(template, intent.templateVariables || {});
      renderedSubject = rendered.renderedSubject;
      renderedBody = rendered.renderedBody;
    }
  } catch (renderErr) {
    console.error('[messageDispatchService] Template render error:', renderErr.message);
    // Proceed with blank content — provider may reject, generating a failure log
  }

  // Resolve provider
  const provider = getProvider(intent.channel);

  // Build idempotency key for the MessageLog
  const attemptNumber = (intent.retryCount || 0) + 1;
  const logIdempotencyKey = `intent:${intent._id}:attempt:${attemptNumber}`;

  // Attempt dispatch
  let providerResult;
  let dispatchStatus;
  let errorCode = null;
  let errorMessage = null;

  try {
    providerResult = await provider.send({
      channel: intent.channel,
      recipient: intent.recipient,
      renderedSubject,
      renderedBody,
      channelMeta: {},
    });
    dispatchStatus = providerResult.status === 'dry_run_suppressed' ? 'queued' : 'sent';
  } catch (providerErr) {
    errorCode = providerErr.code || 'PROVIDER_ERROR';
    errorMessage = providerErr.message || 'Unknown provider error';
    dispatchStatus = 'failed';
    providerResult = { providerMessageId: null, status: 'failed', raw: {} };
    console.error(`[messageDispatchService] Provider error (${intent.channel}):`, errorMessage);
  }

  // Build MessageLog record
  const logData = {
    customerId: intent.customerId,
    campaignId: intent.campaignId || null,
    automationId: intent.automationId || null,
    channel: intent.channel,
    recipient: intent.recipient,
    messageType: intent.messageType,
    status: dispatchStatus,
    providerMessageId: providerResult.providerMessageId || null,
    intentId: intent._id,
    templateSlug: intent.templateSlug,
    templateId,
    renderedSubject,
    renderedBody,
    retryCount: intent.retryCount || 0,
    idempotencyKey: logIdempotencyKey,
    providerRaw: providerResult.raw || null,
    sentAt: dispatchStatus === 'sent' ? new Date() : null,
    error: dispatchStatus === 'failed' ? { code: errorCode, message: errorMessage } : { code: null, message: null },
  };

  let messageLog;
  try {
    messageLog = await MessageLog.create(logData);
  } catch (logErr) {
    // If idempotency key collision, return existing log
    if (logErr.code === 11000) {
      messageLog = await MessageLog.findOne({ idempotencyKey: logIdempotencyKey });
      if (!messageLog) throw logErr;
    } else {
      throw logErr;
    }
  }

  // Update intent status
  if (dispatchStatus === 'failed') {
    const nextRetry = computeNextRetryAt(intent.retryCount || 0);
    const newRetryCount = (intent.retryCount || 0) + 1;
    const hasFinallyFailed = newRetryCount >= (intent.maxRetries || 3);

    await MessageIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: hasFinallyFailed ? 'failed' : 'pending',
          retryCount: newRetryCount,
          nextRetryAt: hasFinallyFailed ? null : nextRetry,
        },
      }
    );
  } else {
    await MessageIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: 'dispatched',
          dispatchedAt: new Date(),
          nextRetryAt: null,
        },
      }
    );
  }

  return messageLog;
}

/**
 * Compute next retry timestamp using exponential backoff.
 * @param {number} currentRetryCount  Number of retries already attempted
 * @returns {Date}
 */
function computeNextRetryAt(currentRetryCount) {
  const index = Math.min(currentRetryCount, RETRY_BACKOFF_MINUTES.length - 1);
  const minutes = RETRY_BACKOFF_MINUTES[index];
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Stub for the future retry worker.
 * Phase 5: Logs a message confirming no automatic retry is active.
 * Phase 6: This will be called by a background queue processor.
 */
async function retryFailedIntents() {
  console.log(
    '[messageDispatchService] retryFailedIntents() called — ' +
    'automatic retry is not activated in Phase 5. No intents were retried.'
  );
  return { retriedCount: 0 };
}

module.exports = {
  createIntent,
  dispatchIntent,
  retryFailedIntents,
  computeNextRetryAt, // exported for testing
};
