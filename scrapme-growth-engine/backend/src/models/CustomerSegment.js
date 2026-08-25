const mongoose = require('mongoose');
const { Schema } = mongoose;

const customerSegmentSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  segmentKey: { type: String, required: true, trim: true, index: true },
  segmentName: { type: String, required: true, trim: true },
  reason: { type: String, required: true, trim: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  calculatedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, default: null },
}, { timestamps: true, collection: 'customer_segments' });

customerSegmentSchema.index({ customerId: 1, segmentKey: 1 }, { unique: true });
customerSegmentSchema.index({ segmentKey: 1, calculatedAt: -1 });

module.exports = mongoose.model('CustomerSegment', customerSegmentSchema);
