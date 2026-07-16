const mongoose = require('mongoose');

const affiliateClickSchema = new mongoose.Schema({
  influencerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Influencer', required: true },
  ip: { type: String, trim: true },
  userAgent: { type: String, trim: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('AffiliateClick', affiliateClickSchema);
