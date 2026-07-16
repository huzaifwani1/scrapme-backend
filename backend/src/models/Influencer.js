const mongoose = require('mongoose');

const influencerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  instagramHandle: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  upiId: { type: String, required: true, trim: true },
  commissionPercent: { type: Number, default: 10 },
  referralCode: { type: String, required: true, unique: true, trim: true, index: true },
  isActive: { type: Boolean, default: true },
  
  // Performance and financial statistics
  totalClicks: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalCompleted: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  totalNetProfit: { type: Number, default: 0 },
  totalCommissionPending: { type: Number, default: 0 },
  totalCommissionPaid: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Influencer', influencerSchema);
