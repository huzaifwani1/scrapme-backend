const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Message Statuses ─────────────────────────────────────────
const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'];

const MESSAGE_CHANNELS = ['email', 'whatsapp', 'sms', 'push'];

// ── Schema ───────────────────────────────────────────────────
const messageLogSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },

    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true,
    },

    automationId: {
      type: Schema.Types.ObjectId,
      ref: 'Automation',
      default: null,
      index: true,
    },

    channel: {
      type: String,
      enum: MESSAGE_CHANNELS,
      required: true,
    },

    // Where the message was sent (email address, phone number, etc.)
    recipient: { type: String, required: true, trim: true },

    messageType: { type: String, trim: true, default: 'transactional' }, // e.g. 'marketing', 'transactional', 'notification'

    status: {
      type: String,
      enum: MESSAGE_STATUSES,
      default: 'queued',
      index: true,
    },

    // ID returned by the delivery provider (e.g. SendGrid, WhatsApp Business API)
    providerMessageId: { type: String, default: null },

    // ── Phase 5 Extensions ──────────────────────────────────
    // Link to the MessageIntent that triggered this delivery attempt
    intentId: {
      type: Schema.Types.ObjectId,
      ref: 'MessageIntent',
      default: null,
      index: true,
    },

    // Template reference (slug and ObjectId for auditability)
    templateSlug: { type: String, default: null },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'MessageTemplate',
      default: null,
    },

    // Rendered content at send time (preserved for audit even if template changes)
    renderedSubject: { type: String, default: null },
    renderedBody: { type: String, default: null },

    // Retry tracking
    retryCount: { type: Number, default: 0, min: 0 },
    nextRetryAt: { type: Date, default: null },

    // Idempotency: one delivery log per intent per attempt
    // Format: intent:{intentId}:attempt:{n}
    idempotencyKey: { type: String, default: null },

    // Raw provider API response (for debugging; never exposed to end-users)
    providerRaw: { type: Schema.Types.Mixed, default: null },

    // Webhook events that updated this log
    webhookEventIds: [{ type: Schema.Types.ObjectId, ref: 'WebhookEvent' }],
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    clickedAt: { type: Date, default: null },

    // ── Error Tracking ──────────────────────────────────────
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    collection: 'message_logs',
  }
);

// ── Indexes ──────────────────────────────────────────────────
messageLogSchema.index({ campaignId: 1, status: 1 });
messageLogSchema.index({ automationId: 1, status: 1 });
messageLogSchema.index({ customerId: 1, sentAt: -1 });
messageLogSchema.index({ channel: 1, status: 1, sentAt: -1 });
messageLogSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    name: 'idx_messagelog_idempotency_key',
  }
);

// ── Statics ──────────────────────────────────────────────────
messageLogSchema.statics.MESSAGE_STATUSES = MESSAGE_STATUSES;
messageLogSchema.statics.MESSAGE_CHANNELS = MESSAGE_CHANNELS;

module.exports = mongoose.model('MessageLog', messageLogSchema);
