'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Constants ─────────────────────────────────────────────────
const WEBHOOK_PROVIDERS = ['sendgrid', 'twilio', 'whatsapp_cloud', 'fcm', 'null'];
const WEBHOOK_EVENT_TYPES = [
  'delivered',
  'bounced',
  'opened',
  'clicked',
  'failed',
  'unsubscribed',
  'spam_report',
  'deferred',
];

// ── Schema ────────────────────────────────────────────────────
const webhookEventSchema = new Schema(
  {
    // Which messaging provider sent this webhook
    provider: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Normalized event type (mapped from provider-specific event names at ingestion time)
    eventType: {
      type: String,
      enum: WEBHOOK_EVENT_TYPES,
      required: true,
    },

    // The provider's own message identifier, used to correlate with MessageLog records
    providerMessageId: {
      type: String,
      default: null,
      index: true,
    },

    // Full raw webhook payload (stored as-is for auditability and debugging).
    // Secrets (HMAC signatures, auth tokens) are stripped before storage.
    rawPayload: {
      type: Schema.Types.Mixed,
      required: true,
    },

    // ── Processing State ──────────────────────────────────────
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processedAt: { type: Date, default: null },

    // Set if processing failed; does not prevent the event from being retried
    processingError: {
      code: { type: String, default: null },
      message: { type: String, default: null },
    },

    // ── Idempotency ───────────────────────────────────────────
    // Format: {provider}:{eventType}:{providerMessageId}:{unix-ms-timestamp}
    // Prevents the same provider webhook notification from being processed twice
    // (providers may re-deliver on network failures or missed acknowledgements).
    idempotencyKey: {
      type: String,
      default: null,
      sparse: true,
    },
  },
  {
    timestamps: true, // createdAt = ingest time
    collection: 'webhook_events',
  }
);

// ── Indexes ───────────────────────────────────────────────────
webhookEventSchema.index({ provider: 1, eventType: 1 });
webhookEventSchema.index({ processed: 1, createdAt: 1 });
webhookEventSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    name: 'idx_webhook_idempotency_key',
  }
);

// ── Statics ───────────────────────────────────────────────────
webhookEventSchema.statics.WEBHOOK_PROVIDERS = WEBHOOK_PROVIDERS;
webhookEventSchema.statics.WEBHOOK_EVENT_TYPES = WEBHOOK_EVENT_TYPES;

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
