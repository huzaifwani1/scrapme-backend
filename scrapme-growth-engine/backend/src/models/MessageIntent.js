'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Constants ─────────────────────────────────────────────────
const MESSAGE_INTENT_CHANNELS = ['email', 'whatsapp', 'sms', 'push'];
const MESSAGE_INTENT_TYPES = ['marketing', 'transactional'];
const MESSAGE_INTENT_STATUSES = [
  'pending',       // Created, not yet dispatched
  'processing',    // Currently being dispatched
  'dispatched',    // Successfully handed off to a provider
  'suppressed',    // Suppressed before dispatch (opt-out, dry-run, missing recipient, etc.)
  'failed',        // All dispatch attempts exhausted
  'cancelled',     // Manually cancelled
];

// ── Schema ────────────────────────────────────────────────────
const messageIntentSchema = new Schema(
  {
    // ── Source References ─────────────────────────────────────
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    automationId: {
      type: Schema.Types.ObjectId,
      ref: 'Automation',
      default: null,
      index: true,
    },
    executionId: {
      type: Schema.Types.ObjectId,
      ref: 'AutomationExecution',
      default: null,
      index: true,
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true,
    },

    // ── Delivery Target ───────────────────────────────────────
    channel: {
      type: String,
      enum: MESSAGE_INTENT_CHANNELS,
      required: true,
    },

    messageType: {
      type: String,
      enum: MESSAGE_INTENT_TYPES,
      default: 'marketing',
    },

    // Slug of the template to render (resolved at dispatch time)
    templateSlug: { type: String, required: true, trim: true },

    // Variable values to inject into the template at render time
    templateVariables: { type: Schema.Types.Mixed, default: {} },

    // Resolved delivery address (email, phone number, push token)
    recipient: { type: String, required: true, trim: true },

    // ── Status & Lifecycle ────────────────────────────────────
    status: {
      type: String,
      enum: MESSAGE_INTENT_STATUSES,
      default: 'pending',
      index: true,
    },

    // Populated if status is 'suppressed'
    suppressionReason: { type: String, default: null },

    // ── Safety Stamp ──────────────────────────────────────────
    // Stamped at creation time from process.env.DRY_RUN.
    // Immutable after creation — the mode at time of intent creation is preserved.
    dryRun: {
      type: Boolean,
      required: true,
      default: true,
    },

    // ── Idempotency ───────────────────────────────────────────
    // Prevents duplicate intents from the same execution action.
    // Format: exec:{executionId}:action:{actionIndex}
    // For campaign-sourced intents: campaign:{campaignId}:customer:{customerId}
    idempotencyKey: {
      type: String,
      default: null,
      sparse: true,
    },

    // ── Scheduling ────────────────────────────────────────────
    // null = dispatch immediately on creation
    scheduledAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },

    // ── Retry Tracking ────────────────────────────────────────
    retryCount: { type: Number, default: 0, min: 0 },
    maxRetries: { type: Number, default: 3 },
    nextRetryAt: { type: Date, default: null },

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: 'message_intents',
  }
);

// ── Indexes ───────────────────────────────────────────────────
messageIntentSchema.index({ customerId: 1, createdAt: -1 });
messageIntentSchema.index({ automationId: 1, status: 1 });
messageIntentSchema.index({ status: 1, scheduledAt: 1 }); // For future queue processing
messageIntentSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    name: 'idx_intent_idempotency_key',
  }
);

// ── Statics ───────────────────────────────────────────────────
messageIntentSchema.statics.MESSAGE_INTENT_CHANNELS = MESSAGE_INTENT_CHANNELS;
messageIntentSchema.statics.MESSAGE_INTENT_TYPES = MESSAGE_INTENT_TYPES;
messageIntentSchema.statics.MESSAGE_INTENT_STATUSES = MESSAGE_INTENT_STATUSES;

module.exports = mongoose.model('MessageIntent', messageIntentSchema);
