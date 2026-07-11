const mongoose = require('mongoose');

const pickupPartnerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['partner', 'warehouse'], default: 'partner' },
  active: { type: Boolean, default: true },
  email: { type: String, default: '' },
  profilePhoto: { type: String, default: '/uploads/default-avatar.png' },
  assignedZone: { type: String, default: 'General' },
  vehicleDetails: { type: String, default: 'Motorcycle' },
  joiningDate: { type: Date, default: Date.now },
  online: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PickupPartner', pickupPartnerSchema);
