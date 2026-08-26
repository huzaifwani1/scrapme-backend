const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Automation Statuses ──────────────────────────────────────
const AUTOMATION_STATUSES = ['draft', 'active', 'paused', 'archived'];

// ── Schema ───────────────────────────────────────────────────
const automationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },

    // ── Trigger ─────────────────────────────────────────────
    // What event or schedule fires this automation.
    // E.g. { type: 'event', eventType: 'request_abandoned', delayMinutes: 60 }
    trigger: {
      type: { type: String, enum: ['event', 'schedule', 'manual'], required: true },
      eventType: { type: String, default: null },        // e.g. 'request_abandoned'
      schedule: { type: String, default: null },          // cron expression
      delayMinutes: { type: Number, default: 0 },         // wait before executing
    },

    // ── Conditions ──────────────────────────────────────────
    // Additional filters that must be true for the automation to fire.
    // E.g. [{ field: 'customerStatus', operator: 'in', value: ['active', 'engaged'] }]
    conditions: [
      {
        field: { type: String, required: true },
        operator: {
          type: String,
          enum: [
            'equals',
            'not_equals',
            'greater_than',
            'greater_than_or_equal',
            'less_than',
            'less_than_or_equal',
            'exists',
            'not_exists',
            'contains',
            'in',
            'not_in'
          ],
          required: true
        },
        value: { type: Schema.Types.Mixed, required: true },
      },
    ],

    // ── Actions ─────────────────────────────────────────────
    // Ordered list of actions to execute.
    // E.g. [{ type: 'send_email', templateId: 'abc', channel: 'email' }]
    actions: [
      {
        type: { type: String, required: true },            // e.g. 'send_email', 'send_whatsapp', 'update_tag', 'wait'
        channel: { type: String, default: null },
        templateId: { type: String, default: null },
        config: { type: Schema.Types.Mixed, default: {} }, // action-specific config
      },
    ],

    status: {
      type: String,
      enum: AUTOMATION_STATUSES,
      default: 'draft',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'automations',
  }
);

// ── Indexes ──────────────────────────────────────────────────
automationSchema.index({ 'trigger.eventType': 1, status: 1 });
automationSchema.index({ createdAt: -1 });

// ── Statics ──────────────────────────────────────────────────
automationSchema.statics.AUTOMATION_STATUSES = AUTOMATION_STATUSES;

module.exports = mongoose.model('Automation', automationSchema);
