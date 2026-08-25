function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getSegmentationConfig(overrides = {}) {
  const config = {
    newCustomerDays: positiveNumber(overrides.newCustomerDays ?? process.env.NEW_CUSTOMER_DAYS, 14),
    inactiveDays: positiveNumber(overrides.inactiveDays ?? process.env.INACTIVE_DAYS, 30),
    dormantDays: positiveNumber(overrides.dormantDays ?? process.env.DORMANT_DAYS, 90),
    highValueRevenueThreshold: positiveNumber(overrides.highValueRevenueThreshold ?? process.env.HIGH_VALUE_REVENUE_THRESHOLD, 10000),
  };
  if (config.dormantDays <= config.inactiveDays) {
    throw new Error('Segmentation configuration error: DORMANT_DAYS must be greater than INACTIVE_DAYS');
  }
  return config;
}

module.exports = { getSegmentationConfig };
