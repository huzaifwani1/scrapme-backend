const mongoose = require('mongoose');

const pickupLocationSchema = new mongoose.Schema({
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickupPartner', required: true, unique: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  route: { type: [[Number]], default: [] }, // Array of [lat, lng]
  eta: { type: String, default: '' },
  battery: { type: Number },
  speed: { type: Number },
  accuracy: { type: Number },
  heading: { type: Number },
  timestamp: { type: Date, default: Date.now },
  address: { type: String, default: '' },
  lastGeocodedLat: { type: Number },
  lastGeocodedLng: { type: Number },
  currentAssignedOrder: { type: String, default: '' },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PickupLocation', pickupLocationSchema);
