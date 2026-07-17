const CommissionSetting = require('../models/CommissionSetting');
const Request = require('../models/Request');
const Influencer = require('../models/Influencer');
const { refreshCommissionCache } = require('../utils/commissionCache');

// ─── ADMIN: GET ALL RULES AND ANALYTICS STATS ───
const getCommissionSettings = async (req, res, next) => {
  try {
    const rules = await CommissionSetting.find().sort({ finalPrice: 1 });
    const activeRules = rules.filter(r => r.isActive);

    const stats = {
      activePriceSlabs: activeRules.length,
      averageCommission: activeRules.length 
        ? Math.round(activeRules.reduce((sum, r) => sum + r.commissionAmount, 0) / activeRules.length) 
        : 0,
      highestCommission: activeRules.length 
        ? Math.max(...activeRules.map(r => r.commissionAmount)) 
        : 0,
      lowestCommission: activeRules.length 
        ? Math.min(...activeRules.map(r => r.commissionAmount)) 
        : 0
    };

    res.json({ rules, stats });
  } catch (err) { next(err); }
};

// ─── ADMIN: ADD A COMMISSION SLAB ───
const addCommissionSetting = async (req, res, next) => {
  try {
    const { finalPrice, commissionAmount, isActive, sortOrder } = req.body;

    const fPrice = Number(finalPrice);
    const cAmount = Number(commissionAmount);

    if (isNaN(fPrice) || fPrice <= 0) {
      return res.status(400).json({ message: 'Final Price must be a positive number' });
    }
    if (isNaN(cAmount) || cAmount < 0) {
      return res.status(400).json({ message: 'Commission cannot be negative' });
    }
    if (cAmount > fPrice) {
      return res.status(400).json({ message: 'Commission cannot exceed Final Price' });
    }

    // Check uniqueness
    const existing = await CommissionSetting.findOne({ finalPrice: fPrice });
    if (existing) {
      return res.status(400).json({ message: `A commission rule for Final Price ₹${fPrice} already exists` });
    }

    const newRule = await CommissionSetting.create({
      finalPrice: fPrice,
      commissionAmount: cAmount,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: Number(sortOrder) || 0
    });

    await refreshCommissionCache();

    res.status(201).json(newRule);
  } catch (err) { next(err); }
};

// ─── ADMIN: UPDATE A COMMISSION SLAB ───
const updateCommissionSetting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { finalPrice, commissionAmount, isActive, sortOrder } = req.body;

    const rule = await CommissionSetting.findById(id);
    if (!rule) {
      return res.status(404).json({ message: 'Commission slab not found' });
    }

    const fPrice = finalPrice !== undefined ? Number(finalPrice) : rule.finalPrice;
    const cAmount = commissionAmount !== undefined ? Number(commissionAmount) : rule.commissionAmount;

    if (isNaN(fPrice) || fPrice <= 0) {
      return res.status(400).json({ message: 'Final Price must be a positive number' });
    }
    if (isNaN(cAmount) || cAmount < 0) {
      return res.status(400).json({ message: 'Commission cannot be negative' });
    }
    if (cAmount > fPrice) {
      return res.status(400).json({ message: 'Commission cannot exceed Final Price' });
    }

    // Check uniqueness if final price is changing
    if (fPrice !== rule.finalPrice) {
      const existing = await CommissionSetting.findOne({ finalPrice: fPrice });
      if (existing) {
        return res.status(400).json({ message: `A commission rule for Final Price ₹${fPrice} already exists` });
      }
    }

    rule.finalPrice = fPrice;
    rule.commissionAmount = cAmount;
    if (isActive !== undefined) rule.isActive = isActive;
    if (sortOrder !== undefined) rule.sortOrder = Number(sortOrder) || 0;

    await rule.save();
    await refreshCommissionCache();

    res.json(rule);
  } catch (err) { next(err); }
};

// ─── ADMIN: TOGGLE ACTIVE STATUS ───
const toggleCommissionSetting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rule = await CommissionSetting.findById(id);
    if (!rule) {
      return res.status(404).json({ message: 'Commission slab not found' });
    }

    rule.isActive = !rule.isActive;
    await rule.save();
    await refreshCommissionCache();

    res.json(rule);
  } catch (err) { next(err); }
};

// ─── ADMIN: DELETE A COMMISSION SLAB ───
const deleteCommissionSetting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rule = await CommissionSetting.findByIdAndDelete(id);
    if (!rule) {
      return res.status(404).json({ message: 'Commission slab not found' });
    }

    await refreshCommissionCache();

    res.json({ message: 'Commission slab deleted successfully', id });
  } catch (err) { next(err); }
};

// ─── ADMIN: MANUALLY APPROVE REVIEW FLAG ───
const approveCommission = async (req, res, next) => {
  try {
    const { requestId, commissionAmount } = req.body;
    if (!requestId) return res.status(400).json({ message: 'Request ID is required' });

    const cAmount = Number(commissionAmount);
    if (isNaN(cAmount) || cAmount < 0) {
      return res.status(400).json({ message: 'Approved commission must be a positive number' });
    }

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Request/Order not found' });
    if (!request.influencerId) return res.status(400).json({ message: 'Order is not linked to an influencer' });
    if (request.commissionStatus !== 'ManualReview') {
      return res.status(400).json({ message: `Only orders in 'ManualReview' status can be manually approved. Current: ${request.commissionStatus}` });
    }

    const influencer = await Influencer.findById(request.influencerId);
    if (!influencer) return res.status(404).json({ message: 'Influencer not found' });

    // Validate manual commission doesn't exceed the request's final price
    const PickupOrder = require('../models/PickupOrder');
    const order = await PickupOrder.findOne({ requestId: request._id });
    const finalAgreedPrice = (order && order.finalPrice !== undefined && order.finalPrice !== null)
      ? order.finalPrice
      : request.priceNum || 0;

    if (cAmount > finalAgreedPrice) {
      return res.status(400).json({ message: `Approved commission (₹${cAmount}) cannot exceed final agreed price (₹${finalAgreedPrice})` });
    }

    // Save manual commission
    request.commissionAmount = cAmount;
    request.commissionStatus = 'Pending';
    request.commissionCalculatedAt = new Date();
    await request.save();

    // Increment pending commission on influencer
    influencer.totalCommissionPending += cAmount;
    await influencer.save();

    res.json({
      message: 'Commission manual approval complete',
      request,
      influencer
    });
  } catch (err) { next(err); }
};

module.exports = {
  getCommissionSettings,
  addCommissionSetting,
  updateCommissionSetting,
  toggleCommissionSetting,
  deleteCommissionSetting,
  approveCommission
};
