const mongoose = require('mongoose');
const Influencer = require('../models/Influencer');
const AffiliateClick = require('../models/AffiliateClick');
const Request = require('../models/Request');

// Helper to parse user-agent headers
function parseUserAgent(ua) {
  let browser = 'Unknown';
  let os = 'Unknown';
  let deviceType = 'Desktop';

  if (!ua) return { browser, os, deviceType };

  // Parse OS
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';

  // Parse Browser
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

  // Parse Device Type
  if (ua.includes('Mobi') || ua.includes('iPhone') || ua.includes('Android')) {
    deviceType = 'Mobile';
  } else if (ua.includes('Tablet') || ua.includes('iPad')) {
    deviceType = 'Tablet';
  }

  return { browser, os, deviceType };
}

// Helper to estimate geolocation based on IP (for simulation)
function getGeoFromIp(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: 'India', city: 'New Delhi' };
  }
  const cities = ['New Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Pune', 'Hyderabad', 'Kolkata'];
  const index = Math.abs(ip.split('.').reduce((acc, oct) => acc + parseInt(oct || 0), 0)) % cities.length;
  return { country: 'India', city: cities[index] };
}

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

    const isDuplicate = !!recentClick;
    const ua = req.headers['user-agent'] || '';
    const { browser, os, deviceType } = parseUserAgent(ua);
    const { country, city } = getGeoFromIp(clientIp);
    const landingPage = req.headers['referer'] || req.headers['origin'] || '/';

    await AffiliateClick.create({
      influencerId: influencer._id,
      ip: clientIp,
      userAgent: ua || 'unknown',
      isDuplicate,
      deviceType,
      browser,
      os,
      country,
      city,
      landingPage,
      referralCode: influencer.referralCode
    });

    if (!isDuplicate) {
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
        { email: { $regex: search, $options: 'i' } },
        { referralCode: { $regex: search, $options: 'i' } }
      ];
    }

    const influencers = await Influencer.find(filter).sort({ createdAt: -1 });

    // Aggregate summary metrics
    const summary = {
      total: await Influencer.countDocuments(),
      active: await Influencer.countDocuments({ isActive: true }),
      clicks: 0,
      completed: 0,
      pendingCommission: 0
    };

    influencers.forEach(inf => {
      summary.clicks += inf.totalClicks;
      summary.completed += inf.totalCompleted;
      summary.pendingCommission += inf.totalCommissionPending;
    });

    res.json({
      influencers,
      summary
    });
  } catch (err) { next(err); }
};

// ─── ADMIN: CREATE INFLUENCER ───
const createInfluencer = async (req, res, next) => {
  try {
    const { name, instagramHandle, phone, email, upiId, commissionPercent, referralCode } = req.body;

    // Check if referral code is unique
    let code = referralCode ? referralCode.trim() : '';
    if (!code) {
      // Generate clean default code from name
      code = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const rand = Math.floor(100 + Math.random() * 900);
      code = `${code}${rand}`;
    }

    const existing = await Influencer.findOne({ referralCode: code });
    if (existing) {
      return res.status(400).json({ message: `Referral code "${code}" is already in use` });
    }

    const influencer = await Influencer.create({
      name,
      instagramHandle,
      phone,
      email,
      upiId,
      commissionPercent: commissionPercent || 10,
      referralCode: code
    });

    res.status(201).json(influencer);
  } catch (err) { next(err); }
};

// ─── ADMIN: GET INFLUENCER DETAILS (DASHBOARD WORK) ───
const getInfluencerDetails = async (req, res, next) => {
  try {
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    // Fetch all requests/orders referred by this influencer
    const requests = await Request.find({ influencerId: influencer._id }).sort({ createdAt: -1 });
    
    // Combine request details with PickupOrder and PickupPartner details
    const PickupOrder = require('../models/PickupOrder');
    const populatedRequests = await Promise.all(requests.map(async (r) => {
      const order = await PickupOrder.findOne({ requestId: r._id }).populate('partnerId');
      return {
        ...r.toObject(),
        orderId: order ? order.orderId : null,
        partner: order && order.partnerId ? order.partnerId.name : null,
        partnerId: order && order.partnerId ? order.partnerId._id : null,
        finalPrice: order ? order.finalPrice : null,
        completedAt: order ? order.completedAt : null,
        extraDevices: order ? order.extraDevices : []
      };
    }));

    // Fetch all clicks
    const clicks = await AffiliateClick.find({ influencerId: influencer._id }).sort({ createdAt: -1 });

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

    // Generate chart data: monthly completed stats
    const monthlyStats = await Request.aggregate([
      { $match: { influencerId: influencer._id, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$updatedAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$priceNum" },
          commission: { $sum: "$commissionAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      influencer,
      requests: populatedRequests,
      clicks,
      charts: {
        clicksOverTime,
        monthlyStats
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

    if (referralCode && referralCode.trim() !== influencer.referralCode) {
      const existing = await Influencer.findOne({ referralCode: referralCode.trim() });
      if (existing) {
        return res.status(400).json({ message: `Referral code "${referralCode}" is already in use` });
      }
      influencer.referralCode = referralCode.trim();
    }

    influencer.name = name || influencer.name;
    influencer.instagramHandle = instagramHandle || influencer.instagramHandle;
    influencer.phone = phone || influencer.phone;
    influencer.email = email || influencer.email;
    influencer.upiId = upiId || influencer.upiId;
    influencer.commissionPercent = commissionPercent !== undefined ? commissionPercent : influencer.commissionPercent;
    if (isActive !== undefined) influencer.isActive = isActive;

    await influencer.save();
    res.json(influencer);
  } catch (err) { next(err); }
};

// ─── ADMIN: DELETE INFLUENCER ───
const deleteInfluencer = async (req, res, next) => {
  try {
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    await Influencer.findByIdAndDelete(req.params.id);

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
    const { requestId, paymentMethod, transactionReference } = req.body;
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
    request.paymentMethod = paymentMethod || 'UPI';
    request.transactionReference = transactionReference || 'N/A';
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

// ─── ADMIN: GET ALL COMMISSIONS ───
const getAllCommissions = async (req, res, next) => {
  try {
    const requests = await Request.find({ influencerId: { $ne: null } })
      .populate('influencerId')
      .sort({ createdAt: -1 });

    const PickupOrder = require('../models/PickupOrder');
    const commissions = await Promise.all(requests.map(async (r) => {
      const order = await PickupOrder.findOne({ requestId: r._id }).populate('partnerId');
      return {
        _id: r._id,
        orderId: order ? order.orderId : 'N/A',
        customerName: r.sellerName,
        phone: r.phone,
        email: r.userEmail || '-',
        device: `${r.brand} ${r.model} (${r.storage})`,
        brand: r.brand,
        commissionAmount: r.commissionAmount || 0,
        commissionStatus: r.commissionStatus || 'Pending',
        generatedOn: r.createdAt,
        paidOn: r.paidAt || null,
        paymentMethod: r.paymentMethod || null,
        transactionReference: r.transactionReference || null,
        influencerName: r.influencerId ? r.influencerId.name : 'Unknown',
        influencerId: r.influencerId ? r.influencerId._id : null,
        partnerName: order && order.partnerId ? order.partnerId.name : 'N/A',
        status: r.status
      };
    }));

    res.json(commissions);
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
  payCommission,
  getAllCommissions
};
