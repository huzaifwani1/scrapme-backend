const mongoose = require('mongoose');

const affiliateClickSchema = new mongoose.Schema({
  influencerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Influencer', required: true },
  ip: { type: String, trim: true },
  userAgent: { type: String, trim: true },
  isDuplicate: { type: Boolean, default: false },
  deviceType: { type: String, default: 'Desktop' },
  browser: { type: String, default: 'Unknown' },
  os: { type: String, default: 'Unknown' },
  country: { type: String, default: 'India' },
  city: { type: String, default: 'New Delhi' },
  landingPage: { type: String, default: '/' },
  referralCode: { type: String }
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('AffiliateClick', affiliateClickSchema);
