const Request = require('../models/Request');
const Message = require('../models/Message');
const User = require('../models/User');

const PRICES = { '32GB': 300, '64GB': 500, '128GB': 700, '256GB': 1200, '512GB': 1500, '1TB': 2400 };

const createRequest = async (req, res, next) => {
  try {
    const { brand, model, storage, sellerName, phone, address } = req.body;
    if (!brand || !model || !storage || !phone || !address)
      return res.status(400).json({ message: 'Missing required fields' });

    const priceNum = PRICES[storage] || 500;
    const price = '₹' + priceNum.toLocaleString('en-IN');
    const date = new Date().toLocaleDateString('en-IN');

    const request = await Request.create({
      userId: req.user._id, userEmail: req.user.email,
      brand, model, storage, sellerName, phone, address,
      price, priceNum, date, status: 'pending'
    });

    // Auto-populate/update user profile phone & address if missing
    try {
      const user = await User.findById(req.user._id);
      if (user) {
        let changed = false;
        if (phone && (!user.phone || user.phone === '-')) {
          user.phone = phone;
          changed = true;
        }
        if (address && (!user.address || user.address === '-')) {
          user.address = address;
          changed = true;
        }
        if (changed) {
          await user.save();
        }
      }
    } catch (err) {
      console.error('Failed to update User profile phone/address on request creation:', err);
    }

    res.status(201).json(request);
  } catch (err) { next(err); }
};

const getMyRequests = async (req, res, next) => {
  try {
    const requests = await Request.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const withMessages = await Promise.all(requests.map(async (r) => {
      const lastMsg = await Message.findOne({ requestId: r._id, from: 'admin' }).sort({ createdAt: -1 });
      return { ...r.toObject(), lastAdminMessage: lastMsg || null };
    }));
    res.json(withMessages);
  } catch (err) { next(err); }
};

module.exports = { createRequest, getMyRequests };
