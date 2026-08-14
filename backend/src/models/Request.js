const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail:  { type: String, required: true },
  brand:      { type: String, required: true },
  model:      { type: String, required: true },
  storage:    { type: String, required: true },
  price:      { type: String },
  priceNum:   { type: Number },
  status:     { type: String, enum: ['pending','evaluated','approved','completed','rejected','contacted','accepted','purchased'], default: 'pending' },
  sellerName: { type: String },
  phone:      { type: String },
  address:    { type: String },
  latitude:   { type: Number },
  longitude:  { type: Number },
  date:       { type: String },
  reviewed:   { type: Boolean, default: false },
  adminNotes: { type: String, default: '' },
  
  // Influencer affiliate fields
  influencerId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Influencer' },
  referralCode:         { type: String },
  commissionAmount:     { type: Number },
  commissionStatus:     { type: String, enum: ['Pending', 'Approved', 'Paid', 'ManualReview'] },
  commissionCalculatedAt: { type: Date },
  paidAt:               { type: Date },
  paymentMethod:        { type: String },
  transactionReference: { type: String }
}, { timestamps: true });

requestSchema.index({ phone: 1 });
requestSchema.index({ userId: 1 });
requestSchema.index({ influencerId: 1 });

module.exports = mongoose.model('Request', requestSchema);
