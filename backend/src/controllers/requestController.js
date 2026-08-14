const Request = require('../models/Request');
const Message = require('../models/Message');
const User = require('../models/User');
const Influencer = require('../models/Influencer');
const mongoose = require('mongoose');

const PRICES = { '32GB': 300, '64GB': 500, '128GB': 700, '256GB': 1200, '512GB': 1500, '1TB': 2400 };
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createRequest = async (req, res, next) => {
  try {
    const { brand, model, storage, sellerName, phone, address, influencerId } = req.body;
    const referralCode = req.body.referralCode || req.body.affiliateCode;

    if (!brand || !model || !storage || !phone || !address)
      return res.status(400).json({ message: 'Missing required fields' });

    const priceNum = PRICES[storage] || 500;
    const price = '₹' + priceNum.toLocaleString('en-IN');
    const date = new Date().toLocaleDateString('en-IN');

    // Never trust client attribution. Resolve it against this database.
    let validatedInfluencerId = undefined;
    let validatedReferralCode = undefined;
    let attributionReason = null;

    if (influencerId || referralCode) {
      const normalizedCode = referralCode && referralCode.trim();
      const byId = influencerId && mongoose.Types.ObjectId.isValid(influencerId)
        ? await Influencer.findOne({ _id: influencerId, isActive: true })
        : null;
      const byCode = normalizedCode
        ? await Influencer.findOne({ referralCode: { $regex: new RegExp(`^${escapeRegex(normalizedCode)}$`, 'i') }, isActive: true })
        : null;

      let influencer = null;
      if (byId && byCode && String(byId._id) !== String(byCode._id)) {
        attributionReason = 'Influencer ID and referral code do not match';
      } else {
        influencer = byId || byCode;
        if (!influencer) attributionReason = 'No active influencer matched the supplied attribution';
      }
      if (influencer) {
        validatedInfluencerId = influencer._id;
        validatedReferralCode = influencer.referralCode;
        influencer.totalOrders += 1;
        await influencer.save();
      }
      if (process.env.NODE_ENV === 'development') {
        console.info('[Affiliate] Request attribution', {
          referralCode: normalizedCode || null,
          influencerResolved: Boolean(influencer),
          influencerId: influencer ? String(influencer._id) : null,
          reason: attributionReason
        });
      }
    }

    const request = await Request.create({
      userId: req.user._id, userEmail: req.user.email,
      brand, model, storage, sellerName, phone, address,
      price, priceNum, date, status: 'pending',
      influencerId: validatedInfluencerId,
      referralCode: validatedReferralCode
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

    const attribution = {
      requested: Boolean(influencerId || referralCode),
      resolved: Boolean(validatedInfluencerId),
      influencerId: validatedInfluencerId ? String(validatedInfluencerId) : null,
      referralCode: validatedReferralCode || null,
      reason: attributionReason
    };
    if (process.env.NODE_ENV === 'development') {
      console.info('[Affiliate] Request created', { requestId: String(request._id), attributionPersisted: attribution.resolved });
    }
    res.status(201).json({ ...request.toObject(), attribution });
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
