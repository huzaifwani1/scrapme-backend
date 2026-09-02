const analyticsService = require('../services/analyticsService');

async function getOverview(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await analyticsService.getOverviewAnalytics({ startDate, endDate });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getAcquisition(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await analyticsService.getAcquisitionAnalytics({ startDate, endDate });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getFunnel(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await analyticsService.getFunnelAnalytics({ startDate, endDate });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getLifecycle(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await analyticsService.getLifecycleAnalytics({ startDate, endDate });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getRevenue(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await analyticsService.getRevenueAnalytics({ startDate, endDate });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getRetention(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await analyticsService.getRetentionAnalytics({ startDate, endDate });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getCampaigns(req, res, next) {
  try {
    const { startDate, endDate, campaignId } = req.query;
    const data = await analyticsService.getCampaignAnalytics({ startDate, endDate, campaignId });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverview,
  getAcquisition,
  getFunnel,
  getLifecycle,
  getRevenue,
  getRetention,
  getCampaigns
};
