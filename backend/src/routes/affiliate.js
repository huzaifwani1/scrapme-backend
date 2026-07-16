const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { getAffiliateDashboard, getAffiliateOrders } = require('../controllers/affiliateController');

// Rate limiting for affiliate portal dashboard/order endpoints
const affiliateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per window
  message: {
    success: false,
    message: 'Too many requests, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware to validate secure token query parameter
const validateAffiliateToken = async (req, res, next) => {
  try {
    const { refCode } = req.params;
    const { token } = req.query;

    if (!token) {
      return res.status(401).json({ message: 'Secure access token is required.' });
    }

    const Influencer = require('../models/Influencer');
    const influencer = await Influencer.findOne({
      referralCode: { $regex: new RegExp(`^${refCode.trim()}$`, 'i') },
      dashboardToken: token,
      isActive: true
    });

    if (!influencer) {
      return res.status(403).json({ message: 'Invalid or unauthorized secure affiliate link.' });
    }

    req.influencer = influencer;
    next();
  } catch (err) {
    next(err);
  }
};

router.use(affiliateLimiter);

router.get('/dashboard/:refCode', validateAffiliateToken, getAffiliateDashboard);
router.get('/orders/:refCode', validateAffiliateToken, getAffiliateOrders);

module.exports = router;
