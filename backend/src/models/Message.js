const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  from:      { type: String, enum: ['admin', 'user'], required: true },
  text:      { type: String, required: true },
  time:      { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
