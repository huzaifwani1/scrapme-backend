const mongoose = require('mongoose');

const commissionSettingSchema = new mongoose.Schema({
  finalPrice: {
    type: Number,
    required: true,
    unique: true
  },
  commissionAmount: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('CommissionSetting', commissionSettingSchema);
