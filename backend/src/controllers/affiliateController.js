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

// ─── GET AFFILIATE DASHBOARD ───
const getAffiliateDashboard = async (req, res, next) => {
  try {
    const influencer = req.influencer; // Set by authentication token middleware

    // Get time boundaries for monthly earnings calculations
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Fetch requests completed in the current and last months
    const [currentMonthReqs, lastMonthReqs, lastPaidRequest] = await Promise.all([
      Request.find({
        influencerId: influencer._id,
        status: 'completed',
        updatedAt: { $gte: startOfCurrentMonth }
      }),
      Request.find({
        influencerId: influencer._id,
        status: 'completed',
        updatedAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
      }),
      Request.findOne({
        influencerId: influencer._id,
        commissionStatus: 'Paid',
        paidAt: { $exists: true }
      }).sort({ paidAt: -1 })
    ]);

    const currentMonthEarnings = currentMonthReqs.reduce((acc, r) => acc + (r.commissionAmount || 0), 0);
    const lastMonthEarnings = lastMonthReqs.reduce((acc, r) => acc + (r.commissionAmount || 0), 0);
    const lifetimeEarnings = influencer.totalCommissionPending + influencer.totalCommissionPaid;

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
      ? Math.round((influencer.totalOrders / influencer.totalClicks) * 1000) / 10 
      : 0;
    const requestToCompletion = influencer.totalOrders > 0 
      ? Math.round((influencer.totalCompleted / influencer.totalOrders) * 1000) / 10 
      : 0;
    const overallConversion = influencer.totalClicks > 0 
      ? Math.round((influencer.totalCompleted / influencer.totalClicks) * 1000) / 10 
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
        totalRequests: influencer.totalOrders,
        totalCompleted: influencer.totalCompleted,
        totalRevenue: influencer.totalRevenue,
        totalNetProfit: influencer.totalNetProfit,
        totalCommissionEarned: lifetimeEarnings,
        totalCommissionPending: influencer.totalCommissionPending,
        totalCommissionPaid: influencer.totalCommissionPaid
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
        pendingAmount: influencer.totalCommissionPending,
        paidAmount: influencer.totalCommissionPaid
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
