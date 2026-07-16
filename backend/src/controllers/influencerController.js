const mongoose = require('mongoose');
const Influencer = require('../models/Influencer');
const AffiliateClick = require('../models/AffiliateClick');
const Request = require('../models/Request');

// ─── PUBLIC ENDPOINT: VALIDATE REFERRAL CODE & RECORD CLICK ───
const validateReferralCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) return res.status(400).json({ valid: false, message: 'Referral code is required' });

    // Look up active influencer with case-insensitive code
    const influencer = await Influencer.findOne({
      referralCode: { $regex: new RegExp(`^${code.trim()}$`, 'i') },
      isActive: true
    });

    if (!influencer) {
      return res.status(404).json({ valid: false, message: 'Invalid or inactive referral code' });
    }

    // IP address extraction
    const clientIp = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown';

    // Duplicate Click prevention: lock click recording to 1 per hour per IP for this influencer
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentClick = await AffiliateClick.findOne({
      influencerId: influencer._id,
      ip: clientIp,
      createdAt: { $gte: oneHourAgo }
    });

    if (!recentClick) {
      await AffiliateClick.create({
        influencerId: influencer._id,
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'unknown'
      });

      // Increment click count
      influencer.totalClicks += 1;
      await influencer.save();
    }

    res.json({
      valid: true,
      influencer: {
        id: influencer._id,
        name: influencer.name,
        referralCode: influencer.referralCode
      }
    });
  } catch (err) { next(err); }
};

// ─── ADMIN: GET ALL INFLUENCERS & SUMMARY STATS ───
const getInfluencers = async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { instagramHandle: { $regex: search, $options: 'i' } },
        { referralCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const influencers = await Influencer.find(filter).sort({ createdAt: -1 });

    // Calculate aggregated statistics for top KPI cards
    const statsSummary = await Influencer.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
          clicks: { $sum: "$totalClicks" },
          completed: { $sum: "$totalCompleted" },
          pendingCommission: { $sum: "$totalCommissionPending" }
        }
      }
    ]);

    const summary = statsSummary[0] || {
      total: 0,
      active: 0,
      clicks: 0,
      completed: 0,
      pendingCommission: 0
    };

    res.json({
      influencers,
      summary
    });
  } catch (err) { next(err); }
};

// ─── ADMIN: CREATE NEW INFLUENCER ───
const createInfluencer = async (req, res, next) => {
  try {
    let { name, instagramHandle, phone, email, upiId, commissionPercent, referralCode } = req.body;

    if (!name || !instagramHandle || !phone || !email || !upiId) {
      return res.status(400).json({ message: 'All profile fields (name, instagram, phone, email, upi) are required' });
    }

    // Clean and validate referral code
    if (!referralCode || referralCode.trim() === '') {
      // Generate clean referral code from name
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const randomSuffix = Math.floor(100 + Math.random() * 900); // 3-digit random number
      referralCode = `${cleanName}${randomSuffix}`;
    } else {
      referralCode = referralCode.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    }

    // Check code uniqueness
    const existing = await Influencer.findOne({ referralCode });
    if (existing) {
      return res.status(400).json({ message: `Referral code "${referralCode}" is already taken.` });
    }

    const commissionVal = parseFloat(commissionPercent);
    const influencer = await Influencer.create({
      name: name.trim(),
      instagramHandle: instagramHandle.trim(),
      phone: phone.trim(),
      email: email.trim(),
      upiId: upiId.trim(),
      commissionPercent: isNaN(commissionVal) ? 10 : commissionVal,
      referralCode
    });

    res.status(201).json(influencer);
  } catch (err) { next(err); }
};

// ─── ADMIN: GET INFLUENCER DETAILS & DASHBOARD METRICS ───
const getInfluencerDetails = async (req, res, next) => {
  try {
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    // Fetch recent requests/orders referred by this influencer
    const requests = await Request.find({ influencerId: influencer._id }).sort({ createdAt: -1 });

    // Generate chart data: clicks over time (last 30 days)
    const clicksOverTime = await AffiliateClick.aggregate([
      { $match: { influencerId: influencer._id } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          clicks: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    // Generate chart data: orders/revenue completed over time (last 30 days)
    const statsOverTime = await Request.aggregate([
      { $match: { influencerId: influencer._id, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$priceNum" },
          commission: { $sum: "$commissionAmount" }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    res.json({
      influencer,
      requests,
      charts: {
        clicksOverTime,
        statsOverTime
      }
    });
  } catch (err) { next(err); }
};

// ─── ADMIN: EDIT INFLUENCER ───
const updateInfluencer = async (req, res, next) => {
  try {
    const { name, instagramHandle, phone, email, upiId, commissionPercent, referralCode, isActive } = req.body;
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    if (referralCode) {
      const cleanCode = referralCode.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanCode !== influencer.referralCode) {
        // Verify unique code
        const codeTaken = await Influencer.findOne({ referralCode: cleanCode });
        if (codeTaken) {
          return res.status(400).json({ message: `Referral code "${cleanCode}" is already taken.` });
        }
        influencer.referralCode = cleanCode;
      }
    }

    if (name) influencer.name = name.trim();
    if (instagramHandle) influencer.instagramHandle = instagramHandle.trim();
    if (phone) influencer.phone = phone.trim();
    if (email) influencer.email = email.trim();
    if (upiId) influencer.upiId = upiId.trim();
    if (commissionPercent !== undefined) {
      const val = parseFloat(commissionPercent);
      if (!isNaN(val)) influencer.commissionPercent = val;
    }
    if (isActive !== undefined) influencer.isActive = !!isActive;

    await influencer.save();
    res.json(influencer);
  } catch (err) { next(err); }
};

// ─── ADMIN: DELETE INFLUENCER ───
const deleteInfluencer = async (req, res, next) => {
  try {
    const influencer = await Influencer.findByIdAndDelete(req.params.id);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    // Dissociate requests
    await Request.updateMany({ influencerId: req.params.id }, { $unset: { influencerId: "" } });
    // Remove clicks
    await AffiliateClick.deleteMany({ influencerId: req.params.id });

    res.json({ message: 'Influencer deleted successfully' });
  } catch (err) { next(err); }
};

// ─── ADMIN: TOGGLE INFLUENCER STATUS ───
const toggleInfluencer = async (req, res, next) => {
  try {
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    influencer.isActive = !influencer.isActive;
    await influencer.save();
    res.json(influencer);
  } catch (err) { next(err); }
};

// ─── ADMIN: MARK COMMISSION PAID ───
const payCommission = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ message: 'Request ID is required' });

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Request/Order not found' });
    if (!request.influencerId) return res.status(400).json({ message: 'Order is not linked to an influencer' });
    if (request.commissionStatus === 'Paid') return res.status(400).json({ message: 'Commission already paid' });

    const influencer = await Influencer.findById(request.influencerId);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    const amount = request.commissionAmount || 0;

    // Update Request commission status
    request.commissionStatus = 'Paid';
    request.paidAt = new Date();
    await request.save();

    // Move pending commission to paid
    influencer.totalCommissionPending = Math.max(0, influencer.totalCommissionPending - amount);
    influencer.totalCommissionPaid += amount;
    await influencer.save();

    res.json({
      message: 'Commission marked as Paid',
      request,
      influencer
    });
  } catch (err) { next(err); }
};

module.exports = {
  validateReferralCode,
  getInfluencers,
  createInfluencer,
  getInfluencerDetails,
  updateInfluencer,
  deleteInfluencer,
  toggleInfluencer,
  payCommission
};
