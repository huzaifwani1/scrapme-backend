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

module.exports = {
  getAffiliateDashboard,
  getAffiliateOrders
};
