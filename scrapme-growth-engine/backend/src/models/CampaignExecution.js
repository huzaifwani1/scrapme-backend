const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  messageIntentId: { type: Schema.Types.ObjectId, ref: 'MessageIntent', default: null },
  executionKey: { type: String, required: true }, status: { type: String, enum: ['simulated','suppressed','failed'], required: true },
  dryRun: { type: Boolean, required: true, default: true }, suppressionReason: { type: String, default: null }, errorCategory: { type: String, default: null },
}, { timestamps: true, collection: 'campaign_executions' });
schema.index({ campaignId: 1, customerId: 1, executionKey: 1 }, { unique: true });
schema.index({ campaignId: 1, createdAt: -1 });
module.exports = mongoose.model('CampaignExecution', schema);
