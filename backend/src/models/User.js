const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  phone: { type: String, default: '-' },
  address: { type: String, default: '-' },
}, { timestamps: true });

userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
