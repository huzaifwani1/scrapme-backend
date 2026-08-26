const mongoose = require('mongoose');
const { Schema } = mongoose;

const AUTOMATION_EXECUTION_STATUSES = ['pending', 'eligible', 'skipped', 'completed', 'failed'];

const automationExecutionSchema = new Schema(
  {
    automationId: {
      type: Schema.Types.ObjectId,
      ref: 'Automation',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    triggerEventId: {
      type: Schema.Types.ObjectId,
      ref: 'CustomerEvent',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: AUTOMATION_EXECUTION_STATUSES,
      required: true,
      default: 'pending',
      index: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    executedAt: {
      type: Date,
      default: null,
    },
    actionResults: {
      type: Schema.Types.Mixed,
      default: [],
    },
    skipReason: {
      type: String,
      default: '',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'automation_executions',
  }
);

// Idempotency: same automation + same customer + same triggering event must be unique
automationExecutionSchema.index(
  { automationId: 1, customerId: 1, triggerEventId: 1 },
  {
    unique: true,
    partialFilterExpression: { triggerEventId: { $type: 'objectId' } },
  }
);

automationExecutionSchema.statics.AUTOMATION_EXECUTION_STATUSES = AUTOMATION_EXECUTION_STATUSES;

module.exports = mongoose.model('AutomationExecution', automationExecutionSchema);
