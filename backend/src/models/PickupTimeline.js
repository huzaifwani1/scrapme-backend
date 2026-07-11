const mongoose = require('mongoose');

const pickupTimelineSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickupOrder' },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickupPartner' },
  eventName: { type: String, required: true }, // e.g. 'assigned', 'navigating', 'arrived', 'otp_generated', 'picked_up', 'warehouse_checked'
  details: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  latitude: { type: Number },
  longitude: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('PickupTimeline', pickupTimelineSchema);
