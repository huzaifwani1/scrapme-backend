const mongoose = require('mongoose');

const extraDeviceSchema = new mongoose.Schema({
  brand: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  storage: { type: String, required: true, trim: true },
  condition: { type: String, required: true, trim: true },
  estimatedPrice: { type: Number, required: true },
  imei: { type: String, trim: true },
  photoUrl: { type: String, trim: true }
});

const warehouseDeviceSchema = new mongoose.Schema({
  brand: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  storage: { type: String, required: true, trim: true },
  condition: { type: String, required: true, trim: true },
  estimatedPrice: { type: Number, required: true },
  imei: { type: String, trim: true },
  photoUrl: { type: String, trim: true },
  status: { type: String, enum: ['received', 'missing', 'damaged'], default: 'received' }
});

const pickupOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickupPartner', required: true },
  status: { 
    type: String, 
    enum: ['assigned', 'picked_up', 'completed', 'cancelled'], 
    default: 'assigned' 
  },
  extraDevices: [extraDeviceSchema],
  notes: { type: String, default: '' },
  distanceTravelled: { type: Number, default: 0 },
  durationMinutes: { type: Number, default: 0 },
  pickupLatitude: { type: Number },
  pickupLongitude: { type: Number },
  finalPrice: { type: Number },
  pickupRemarks: { type: String },
  
  // Warehouse checks
  warehouseVerified: { type: Boolean, default: false },
  warehouseVerifiedAt: { type: Date },
  warehouseStatus: { 
    type: String, 
    enum: ['pending', 'verified', 'discrepancy'], 
    default: 'pending' 
  },
  warehouseDevices: [warehouseDeviceSchema],
  warehouseNotes: { type: String, default: '' },
  
  // Timestamps of activities
  startedAt: { type: Date },
  pickedUpAt: { type: Date },
  completedAt: { type: Date },
  
  // Cancellation details
  cancellationReason: { type: String },
  cancelledBy: { type: String, enum: ['admin', 'partner', 'customer'] },
  cancelledAt: { type: Date }
}, { timestamps: true });

pickupOrderSchema.index(
  { requestId: 1 },
  { 
    unique: true, 
    partialFilterExpression: { status: { $ne: 'cancelled' } } 
  }
);

module.exports = mongoose.model('PickupOrder', pickupOrderSchema);
