const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Customer Statuses ────────────────────────────────────────
const CUSTOMER_STATUSES = [
  'new',           // Just entered the system
  'active',        // Has recent activity
  'engaged',       // Multiple interactions / orders
  'inactive',      // No activity for extended period
  'churned',       // Considered lost
  'reactivated',   // Returned after inactivity
];

// ── Schema ───────────────────────────────────────────────────
const customerSchema = new Schema(
  {
    // ── External ID mapping ─────────────────────────────────
    // Reference to the ScrapMe transaction-engine user.
    // We do NOT duplicate the entire user document — only map by ID.
    scrapmeUserId: {
      type: String,
      default: null,
    },

    // ── Identity ────────────────────────────────────────────
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },
    location: {
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
    },

    // ── Acquisition / Attribution ───────────────────────────
    acquisitionSource: { type: String, trim: true, default: 'direct' },  // e.g. google, instagram, referral, direct
    acquisitionMedium: { type: String, trim: true, default: '' },        // e.g. organic, paid, social, influencer
    acquisitionCampaign: { type: String, trim: true, default: '' },      // UTM campaign name
    influencerId: { type: String, default: null, index: true, sparse: true },
    referralCode: { type: String, default: null, index: true, sparse: true },

    // ── Activity Timestamps ─────────────────────────────────
    firstSeenAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },

    // ── Aggregated Metrics ──────────────────────────────────
    // These are maintained by event processing — not directly from the ScrapMe DB.
    totalOrders: { type: Number, default: 0, min: 0 },
    completedOrders: { type: Number, default: 0, min: 0 },
    totalRevenue: { type: Number, default: 0, min: 0 },

    // ── Status & Segmentation ───────────────────────────────
    customerStatus: {
      type: String,
      enum: CUSTOMER_STATUSES,
      default: 'new',
      index: true,
    },
    tags: [{ type: String, trim: true }],
  },
  {
    timestamps: true,     // adds createdAt, updatedAt
    collection: 'customers',
  }
);

// ── Indexes ──────────────────────────────────────────────────
// Optional identities are unique only when populated. Sparse unique indexes
// still index explicit `null` values; partial indexes safely allow many users
// whose email or phone is unavailable.
customerSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } });
customerSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' } } });
customerSchema.index({ lastActivityAt: -1 });
customerSchema.index({ acquisitionSource: 1, createdAt: -1 });
customerSchema.index({ tags: 1 });
customerSchema.index({ scrapmeUserId: 1 }, { unique: true, partialFilterExpression: { scrapmeUserId: { $type: 'string', $gt: '' } } });

// ── Statics ──────────────────────────────────────────────────
customerSchema.statics.CUSTOMER_STATUSES = CUSTOMER_STATUSES;

module.exports = mongoose.model('Customer', customerSchema);
