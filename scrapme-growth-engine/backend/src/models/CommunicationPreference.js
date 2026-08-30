'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Constants ─────────────────────────────────────────────────
const PREFERENCE_CHANNELS = ['email', 'whatsapp', 'sms', 'push'];
const PREFERENCE_MESSAGE_TYPES = ['marketing', 'transactional', 'all'];
const PREFERENCE_SOURCES = ['customer_request', 'admin', 'import', 'webhook', 'system'];

// ── Schema ────────────────────────────────────────────────────
const communicationPreferenceSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },

    // Which channel this preference governs
    channel: {
      type: String,
      enum: PREFERENCE_CHANNELS,
      required: true,
    },

    // Which message type this preference governs.
    // 'all' applies to every message type on this channel.
    // Specific types (marketing / transactional) take precedence over 'all'
    // when both exist.
    messageType: {
      type: String,
      enum: PREFERENCE_MESSAGE_TYPES,
      required: true,
    },

    // ── Current State ─────────────────────────────────────────
    optedIn: { type: Boolean, default: true },

    // Timestamps of last opt-in / opt-out transitions
    optedInAt: { type: Date, default: null },
    optedOutAt: { type: Date, default: null },

    // ── Attribution ────────────────────────────────────────────
    // Where this preference was set.
    source: {
      type: String,
      enum: PREFERENCE_SOURCES,
      default: 'system',
    },

    // Human-readable reason for opt-out (e.g. 'unsubscribe_link', 'spam_complaint', 'customer_request')
    reason: { type: String, trim: true, default: null },

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true, // createdAt, updatedAt
    collection: 'communication_preferences',
  }
);

// ── Indexes ───────────────────────────────────────────────────
// One document per customer × channel × messageType triple.
communicationPreferenceSchema.index(
  { customerId: 1, channel: 1, messageType: 1 },
  { unique: true, name: 'idx_customer_channel_type_unique' }
);
communicationPreferenceSchema.index({ customerId: 1, optedIn: 1 });
communicationPreferenceSchema.index({ channel: 1, optedIn: 1 });
communicationPreferenceSchema.index({ optedOutAt: -1 });

// ── Statics ───────────────────────────────────────────────────
communicationPreferenceSchema.statics.PREFERENCE_CHANNELS = PREFERENCE_CHANNELS;
communicationPreferenceSchema.statics.PREFERENCE_MESSAGE_TYPES = PREFERENCE_MESSAGE_TYPES;
communicationPreferenceSchema.statics.PREFERENCE_SOURCES = PREFERENCE_SOURCES;

module.exports = mongoose.model('CommunicationPreference', communicationPreferenceSchema);
