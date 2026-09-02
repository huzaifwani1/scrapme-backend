const mongoose = require('mongoose');
const intelligenceService = require('../services/intelligenceService');

async function getSummary(req, res, next) {
  try {
    const data = await intelligenceService.getIntelligenceSummary();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getOpportunities(req, res, next) {
  try {
    const { page, limit, priorityTier, opportunityType } = req.query;
    const data = await intelligenceService.getOpportunitiesList({
      page,
      limit,
      priorityTier,
      opportunityType
    });
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

async function getNextBestActions(req, res, next) {
  try {
    const { page, limit, priorityTier, opportunityType } = req.query;
    const data = await intelligenceService.getNextBestActions({
      page,
      limit,
      priorityTier,
      opportunityType
    });
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

async function getCustomerProfile(req, res, next) {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error('Invalid customer ID format');
      err.statusCode = 400;
      throw err;
    }
    const data = await intelligenceService.getCustomerIntelligenceProfile(id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getOpportunities,
  getNextBestActions,
  getCustomerProfile
};
