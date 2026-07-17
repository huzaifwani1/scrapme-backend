const CommissionSetting = require('../models/CommissionSetting');

let cachedRules = [];

const refreshCommissionCache = async () => {
  try {
    cachedRules = await CommissionSetting.find({ isActive: true }).sort({ sortOrder: 1, finalPrice: 1 });
    console.log(`[Commission Cache] Loaded ${cachedRules.length} active commission rules into memory.`);
  } catch (err) {
    console.error('[Commission Cache] Failed to load commission cache:', err);
  }
};

const getCachedCommission = (finalPrice) => {
  const rule = cachedRules.find(r => r.finalPrice === finalPrice);
  return rule ? rule.commissionAmount : null;
};

module.exports = {
  refreshCommissionCache,
  getCachedCommission
};
