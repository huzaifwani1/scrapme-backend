const Influencer = require('../models/Influencer');
const Request = require('../models/Request');
const AffiliateClick = require('../models/AffiliateClick');
const PickupOrder = require('../models/PickupOrder');

// Customer privacy masking helpers
const maskName = (name) => {
  if (!name) return '—';
  return name.split(' ').map(word => {
    if (word.length <= 1) return word;
    return word[0] + '*'.repeat(word.length - 1);
  }).join(' ');
};

const maskPhone = (phone) => {
  if (!phone) return '—';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length < 5) return '*****';
  return clean.slice(0, 3) + '*'.repeat(clean.length - 5) + clean.slice(-2);
};

const getAffiliateDashboard = async (req, res, next) => {
  try {
    const influencer = req.influencer; // Set by authentication token middleware

    // Get time boundaries for monthly earnings calculations
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Fetch all requests linked to this influencer
    const allRequests = await Request.find({ influencerId: influencer._id });
    
    // Fetch requests completed in the current and last months
    const currentMonthReqs = allRequests.filter(r => 
      r.status === 'completed' && r.updatedAt >= startOfCurrentMonth
    );
    const lastMonthReqs = allRequests.filter(r => 
      r.status === 'completed' && r.updatedAt >= startOfLastMonth && r.updatedAt <= endOfLastMonth
    );
    const lastPaidRequest = await Request.findOne({
      influencerId: influencer._id,
      commissionStatus: 'Paid',
      paidAt: { $exists: true }
    }).sort({ paidAt: -1 });

    const currentMonthEarnings = currentMonthReqs.reduce((acc, r) => acc + (r.commissionAmount || 0), 0);
    const lastMonthEarnings = lastMonthReqs.reduce((acc, r) => acc + (r.commissionAmount || 0), 0);

    const dbTotalRequests = allRequests.length;
    const dbTotalCompleted = allRequests.filter(r => r.status === 'completed').length;
    
    // Calculate totalRevenue, totalCommissionPending, totalCommissionPaid dynamically
    const completedReqIds = allRequests.filter(r => r.status === 'completed').map(r => r._id);
    const pickupOrders = await PickupOrder.find({ requestId: { $in: completedReqIds } });
    const completedOrderMap = {};
    pickupOrders.forEach(o => {
      completedOrderMap[o.requestId.toString()] = o;
    });

    let totalRevenue = 0;
    let totalCommissionPending = 0;
    let totalCommissionPaid = 0;

    allRequests.filter(r => r.status === 'completed').forEach(r => {
      const order = completedOrderMap[r._id.toString()];
      const finalPrice = (order && order.finalPrice !== undefined && order.finalPrice !== null)
        ? order.finalPrice
        : (r.priceNum || 0);
      totalRevenue += finalPrice;

      const comm = r.commissionAmount || 0;
      if (r.commissionStatus === 'Paid') {
        totalCommissionPaid += comm;
      } else if (r.commissionStatus === 'Pending' || r.commissionStatus === 'Approved' || r.commissionStatus === 'ManualReview') {
        totalCommissionPending += comm;
      }
    });

    const lifetimeEarnings = totalCommissionPending + totalCommissionPaid;
    const totalNetProfit = Math.round(totalRevenue * 0.20);

    // Next payout date: 10th of next month
    const nextMonthName = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-IN', { month: 'long' });
    const nextPayoutDate = `10th of ${nextMonthName}`;
    const lastPaymentDate = lastPaidRequest && lastPaidRequest.paidAt 
      ? lastPaidRequest.paidAt.toLocaleDateString('en-IN') 
      : '—';

    // Chart Time-series Aggregation: last 30 days Click logs
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

    // Chart Time-series Aggregation: last 30 days Requests
    const requestsOverTime = await Request.aggregate([
      { $match: { influencerId: influencer._id } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          requests: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    // Chart Time-series Aggregation: last 30 days Completions
    const completionsOverTime = await Request.aggregate([
      { $match: { influencerId: influencer._id, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
          completions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    // Chart aggregations: monthly completed stats
    const monthlyStats = await Request.aggregate([
      { $match: { influencerId: influencer._id, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$priceNum" },
          commission: { $sum: "$commissionAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate Conversion rates
    const visitorToRequest = influencer.totalClicks > 0 
      ? Math.round((dbTotalRequests / influencer.totalClicks) * 1000) / 10 
      : 0;
    const requestToCompletion = dbTotalRequests > 0 
      ? Math.round((dbTotalCompleted / dbTotalRequests) * 1000) / 10 
      : 0;
    const overallConversion = influencer.totalClicks > 0 
      ? Math.round((dbTotalCompleted / influencer.totalClicks) * 1000) / 10 
      : 0;

    res.json({
      influencer: {
        name: influencer.name,
        instagramHandle: influencer.instagramHandle,
        referralCode: influencer.referralCode,
        commissionPercent: influencer.commissionPercent,
        upiId: influencer.upiId
      },
      metrics: {
        totalClicks: influencer.totalClicks,
        totalRequests: dbTotalRequests,
        totalCompleted: dbTotalCompleted,
        totalRevenue: totalRevenue,
        totalNetProfit: totalNetProfit,
        totalCommissionEarned: lifetimeEarnings,
        totalCommissionPending: totalCommissionPending,
        totalCommissionPaid: totalCommissionPaid
      },
      conversionRates: {
        visitorToRequest,
        requestToCompletion,
        overallConversion
      },
      payouts: {
        currentMonthEarnings,
        lastMonthEarnings,
        lifetimeEarnings,
        nextPayoutDate,
        lastPaymentDate,
        pendingAmount: totalCommissionPending,
        paidAmount: totalCommissionPaid
      },
      charts: {
        clicksOverTime,
        requestsOverTime,
        completionsOverTime,
        monthlyStats
      }
    });
  } catch (err) { next(err); }
};

// ─── GET AFFILIATE ORDERS (PRIVACY-MASKED) ───
const getAffiliateOrders = async (req, res, next) => {
  try {
    const influencer = req.influencer;

    // Fetch requests referred by this influencer
    const requests = await Request.find({ influencerId: influencer._id }).sort({ createdAt: -1 });

    const populatedOrders = await Promise.all(requests.map(async (r) => {
      const order = await PickupOrder.findOne({ requestId: r._id });
      
      return {
        _id: r._id,
        orderId: order ? order.orderId : null,
        createdAt: r.createdAt,
        customerName: maskName(r.sellerName),
        phone: maskPhone(r.phone),
        brand: r.brand,
        model: r.model,
        storage: r.storage,
        status: r.status,
        priceNum: r.priceNum || 0, // Offer price
        finalPrice: order ? order.finalPrice : null, // Final sale price
        commissionAmount: r.commissionAmount || 0,
        commissionStatus: r.commissionStatus || 'Pending',
        paidAt: r.paidAt,
        paymentMethod: r.paymentMethod || '—',
        transactionReference: r.transactionReference || '—'
      };
    }));

    res.json(populatedOrders);
  } catch (err) { next(err); }
};

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── INFLUENCER LOGIN ───
const influencerLogin = async (req, res, next) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ message: 'Login ID and password are required' });
    }

    const cleanId = loginId.trim();
    const influencer = await Influencer.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${cleanId}$`, 'i') } },
        { phone: cleanId }
      ]
    });

    if (!influencer) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!influencer.isActive) {
      return res.status(403).json({ message: 'Influencer account is inactive' });
    }

    if (influencer.isLoginEnabled === false) {
      return res.status(403).json({ message: 'Login is disabled for this influencer account' });
    }

    let isMatch = false;
    if (influencer.passwordHash) {
      isMatch = await bcrypt.compare(password, influencer.passwordHash);
    } else if (influencer.tempPassword && password === influencer.tempPassword) {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    influencer.lastLogin = new Date();
    await Influencer.updateOne({ _id: influencer._id }, { lastLogin: influencer.lastLogin });

    const secret = process.env.JWT_SECRET || 'scrapme_jwt_secret_2026';
    const token = jwt.sign(
      { id: influencer._id, referralCode: influencer.referralCode },
      secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token,
      influencer: {
        name: influencer.name,
        referralCode: influencer.referralCode
      }
    });
  } catch (err) { next(err); }
};

// ─── FORGOT PASSWORD ───
const influencerForgotPassword = async (req, res, next) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      return res.status(400).json({ message: 'Email or Phone is required' });
    }

    const cleanId = loginId.trim();
    const influencer = await Influencer.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${cleanId}$`, 'i') } },
        { phone: cleanId }
      ]
    });

    if (!influencer) {
      return res.status(404).json({ message: 'No account associated with this email/phone' });
    }

    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    influencer.passwordResetToken = resetToken;
    influencer.passwordResetExpiry = new Date(Date.now() + 3600000); // 1 hour
    await influencer.save();

    const resetUrl = `https://www.scrapme.in/influencer.html?resetToken=${resetToken}`;
    
    const nodemailer = require('nodemailer');
    if (process.env.EMAIL_ENABLED === 'true' || process.env.NODE_ENV === 'development') {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
          port: parseInt(process.env.EMAIL_PORT, 10) || 587,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        await transporter.sendMail({
          from: process.env.EMAIL_FROM || '"ScrapMe Program" <noreply@scrapme.in>',
          to: influencer.email,
          subject: 'ScrapMe Portal Password Reset Request',
          text: `You requested a password reset. Click this link to set a new password:\n\n${resetUrl}\n\nThis link is valid for 1 hour.`,
          html: `<p>You requested a password reset. Click the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link is valid for 1 hour.</p>`
        });
      } catch (mailErr) {
        console.error('Nodemailer failed to send password reset email:', mailErr);
      }
    }

    res.json({
      success: true,
      message: 'Password reset link sent successfully.',
      resetToken
    });
  } catch (err) { next(err); }
};

// ─── RESET PASSWORD ───
const influencerResetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    const influencer = await Influencer.findOne({
      passwordResetToken: token,
      passwordResetExpiry: { $gt: new Date() }
    });

    if (!influencer) {
      return res.status(400).json({ message: 'Reset token is invalid or has expired' });
    }

    influencer.passwordHash = await bcrypt.hash(newPassword, 10);
    influencer.tempPassword = undefined;
    influencer.passwordResetToken = undefined;
    influencer.passwordResetExpiry = undefined;
    await influencer.save();

    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (err) { next(err); }
};

// ─── CHANGE PASSWORD (AUTHENTICATED) ───
const influencerChangePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const influencer = req.influencer;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    let isMatch = false;
    if (influencer.passwordHash) {
      isMatch = await bcrypt.compare(oldPassword, influencer.passwordHash);
    } else if (influencer.tempPassword && oldPassword === influencer.tempPassword) {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect current password' });
    }

    influencer.passwordHash = await bcrypt.hash(newPassword, 10);
    influencer.tempPassword = undefined;
    await influencer.save();

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) { next(err); }
};

module.exports = {
  getAffiliateDashboard,
  getAffiliateOrders,
  influencerLogin,
  influencerForgotPassword,
  influencerResetPassword,
  influencerChangePassword
};
