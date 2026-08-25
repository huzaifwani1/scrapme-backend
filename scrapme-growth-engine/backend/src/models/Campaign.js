const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Campaign Types ───────────────────────────────────────────
const CAMPAIGN_TYPES = [
  'one_time',       // Single blast
  'recurring',      // Scheduled recurring
  'triggered',      // Event-triggered
  'drip',           // Multi-step drip sequence
];

const CAMPAIGN_CHANNELS = ['email', 'whatsapp', 'sms', 'push'];

const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'];

// ── Schema ───────────────────────────────────────────────────
const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    type: {
      type: String,
      enum: CAMPAIGN_TYPES,
      required: true,
    },

    channel: {
      type: String,
      enum: CAMPAIGN_CHANNELS,
      required: true,
    },

    status: {
      type: String,
      enum: CAMPAIGN_STATUSES,
      default: 'draft',
      index: true,
    },

    // ── Audience / Segment Definition ───────────────────────
    // Flexible object describing who this campaign targets.
    // E.g. { customerStatus: ['inactive'], tags: ['high-value'], minOrders: 2 }
    audience: { type: Schema.Types.Mixed, default: {} },

    // ── Content ─────────────────────────────────────────────
    // Reference to a template or inline content.
    content: {
      templateId: { type: String, default: null },
      subject: { type: String, trim: true, default: '' },
      body: { type: String, default: '' },
    },

    // ── Scheduling ──────────────────────────────────────────
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // ── Aggregate Metrics ───────────────────────────────────
    metrics: {
      totalSent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    collection: 'campaigns',
  }
);

// ── Indexes ──────────────────────────────────────────────────
campaignSchema.index({ status: 1, scheduledAt: 1 });
campaignSchema.index({ channel: 1, status: 1 });
campaignSchema.index({ createdAt: -1 });

// ── Statics ──────────────────────────────────────────────────
campaignSchema.statics.CAMPAIGN_TYPES = CAMPAIGN_TYPES;
campaignSchema.statics.CAMPAIGN_CHANNELS = CAMPAIGN_CHANNELS;
campaignSchema.statics.CAMPAIGN_STATUSES = CAMPAIGN_STATUSES;

module.exports = mongoose.model('Campaign', campaignSchema);
