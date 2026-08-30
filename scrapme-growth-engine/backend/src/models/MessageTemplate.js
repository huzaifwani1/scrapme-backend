'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Constants ─────────────────────────────────────────────────
const TEMPLATE_CHANNELS = ['email', 'whatsapp', 'sms', 'push'];
const TEMPLATE_MESSAGE_TYPES = ['marketing', 'transactional'];
const TEMPLATE_STATUSES = ['draft', 'active', 'archived'];

// ── Schema ────────────────────────────────────────────────────
const messageTemplateSchema = new Schema(
  {
    // ── Identity ─────────────────────────────────────────────
    name: { type: String, required: true, trim: true },

    // Stable human-readable key used by automations to reference this template.
    // Always resolves to the current active version of the slug.
    // e.g. "abandoned_request_email", "pickup_complete_whatsapp"
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9_-]+$/, 'Slug may only contain lowercase letters, numbers, underscores, and hyphens'],
    },

    description: { type: String, trim: true, default: '' },

    // ── Channel & Type ────────────────────────────────────────
    channel: {
      type: String,
      enum: TEMPLATE_CHANNELS,
      required: true,
    },

    messageType: {
      type: String,
      enum: TEMPLATE_MESSAGE_TYPES,
      default: 'marketing',
    },

    status: {
      type: String,
      enum: TEMPLATE_STATUSES,
      default: 'draft',
      index: true,
    },

    // ── Content ───────────────────────────────────────────────
    content: {
      // Email only; ignored for other channels
      subject: { type: String, trim: true, default: '' },

      // Main message body.
      // Supports safe {{variable}} placeholders — see templateService for rendering.
      body: { type: String, required: true },

      // Email only — shown in inbox preview line
      previewText: { type: String, trim: true, default: '' },
    },

    // Declared list of placeholder keys this template uses.
    // e.g. ['customerName', 'pickupDate', 'city']
    // templateService validates that all declared keys are supplied before rendering.
    variables: [{ type: String, trim: true, match: /^[a-zA-Z0-9_]+$/ }],

    // Channel-specific configuration passed to the provider.
    // e.g. { fromName: 'ScrapMe', replyTo: 'support@scrapme.in' } for email
    // e.g. { templateName: 'whatsapp_template_key' } for WhatsApp Business
    channelMeta: { type: Schema.Types.Mixed, default: {} },

    // ── Versioning ────────────────────────────────────────────
    // Starts at 1 for the original. Increments on each update.
    version: { type: Number, default: 1, min: 1 },

    // Points to the original template ObjectId when this document is a historical clone.
    // null = this is the canonical (latest) template for the slug.
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'MessageTemplate',
      default: null,
      index: true,
    },

    // ── Audit ─────────────────────────────────────────────────
    createdBy: { type: String, trim: true, default: 'system' },
  },
  {
    timestamps: true,
    collection: 'message_templates',
  }
);

// ── Indexes ───────────────────────────────────────────────────
// Unique slug per channel. Two different channels may share a slug only if
// they represent the same conceptual template adapted for each channel.
// We enforce uniqueness on the canonical (parentId: null) document per slug+channel.
messageTemplateSchema.index(
  { slug: 1, channel: 1 },
  {
    unique: true,
    partialFilterExpression: { parentId: { $eq: null } },
    name: 'idx_slug_channel_canonical',
  }
);
messageTemplateSchema.index({ channel: 1, status: 1 });
messageTemplateSchema.index({ createdAt: -1 });

// ── Statics ───────────────────────────────────────────────────
messageTemplateSchema.statics.TEMPLATE_CHANNELS = TEMPLATE_CHANNELS;
messageTemplateSchema.statics.TEMPLATE_MESSAGE_TYPES = TEMPLATE_MESSAGE_TYPES;
messageTemplateSchema.statics.TEMPLATE_STATUSES = TEMPLATE_STATUSES;

module.exports = mongoose.model('MessageTemplate', messageTemplateSchema);
