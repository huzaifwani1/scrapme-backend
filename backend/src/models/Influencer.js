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
  totalCommissionPaid: { type: Number, default: 0 },
  dashboardToken: { type: String, unique: true, sparse: true },
  
  // Login credentials and audit fields
  passwordHash: { type: String },
  tempPassword: { type: String },
  isLoginEnabled: { type: Boolean, default: true },
  lastLogin: { type: Date },
  lastActive: { type: Date },
  passwordResetToken: { type: String },
  passwordResetExpiry: { type: Date }
}, { timestamps: true });

const crypto = require('crypto');
influencerSchema.pre('save', function(next) {
  if (!this.dashboardToken) {
    this.dashboardToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

module.exports = mongoose.model('Influencer', influencerSchema);

