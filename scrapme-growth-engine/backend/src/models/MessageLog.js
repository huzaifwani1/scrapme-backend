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

    // ── Delivery Timeline ───────────────────────────────────
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

// ── Statics ──────────────────────────────────────────────────
messageLogSchema.statics.MESSAGE_STATUSES = MESSAGE_STATUSES;
messageLogSchema.statics.MESSAGE_CHANNELS = MESSAGE_CHANNELS;

module.exports = mongoose.model('MessageLog', messageLogSchema);
