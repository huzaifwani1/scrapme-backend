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
    enum: ['assigned', 'navigating', 'arrived', 'picked_up', 'completed', 'cancelled'], 
    default: 'assigned' 
  },
  otp: { type: String, trim: true },
  otpGeneratedAt: { type: Date },
  otpExpiresAt: { type: Date },
  otpFailedAttempts: { type: Number, default: 0 },
  otpLockedUntil: { type: Date },
  otpResendsCount: { type: Number, default: 0 },
  _test_otp: { type: String },
  otpStatus: { 
    type: String, 
    enum: ['Not Generated', 'Sent', 'Delivered', 'Verified', 'Expired', 'Failed'], 
    default: 'Not Generated' 
  },
  otpRequestId: { type: String, trim: true },
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
