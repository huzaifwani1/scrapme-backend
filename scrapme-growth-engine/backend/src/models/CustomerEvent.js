const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Supported Event Types ────────────────────────────────────
const EVENT_TYPES = [
  'page_visit',
  'quote_created',
  'request_started',
  'request_submitted',
  'request_abandoned',
  'pickup_assigned',
  'pickup_completed',
  'payment_completed',
  'review_submitted',
  'referral_click',
];

// ── Schema ───────────────────────────────────────────────────
const customerEventSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },

    // ── External ID references (from ScrapMe transaction engine) ─
    scrapmeRequestId: { type: String, default: null, index: true, sparse: true },
    scrapmePickupOrderId: { type: String, default: null, index: true, sparse: true },

    // Stable external-event identity used to make historical synchronisation idempotent.
    sourceEventKey: { type: String, default: null, unique: true, sparse: true },

    eventType: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
      index: true,
    },

    // Where the event was emitted from (e.g. 'web', 'partner-app', 'admin', 'api')
    source: { type: String, trim: true, default: 'web' },

    // Flexible payload for event-specific data
    metadata: { type: Schema.Types.Mixed, default: {} },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // we use our own `timestamp` field
    collection: 'customer_events',
  }
);

// ── Compound Indexes ─────────────────────────────────────────
customerEventSchema.index({ customerId: 1, eventType: 1, timestamp: -1 });
customerEventSchema.index({ eventType: 1, timestamp: -1 });

// ── Statics ──────────────────────────────────────────────────
customerEventSchema.statics.EVENT_TYPES = EVENT_TYPES;

module.exports = mongoose.model('CustomerEvent', customerEventSchema);
