const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail:  { type: String, required: true },
  brand:      { type: String, required: true },
  model:      { type: String, required: true },
  storage:    { type: String, required: true },
  price:      { type: String },
  priceNum:   { type: Number },
  status:     { type: String, enum: ['pending','evaluated','approved','completed','rejected'], default: 'pending' },
  sellerName: { type: String },
  phone:      { type: String },
  address:    { type: String },
  date:       { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);
