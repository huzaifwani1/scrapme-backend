const { syncScrapmeData } = require('../services/scrapmeSyncService');
const asyncHandler = require('../utils/asyncHandler');

exports.runSync = asyncHandler(async (req, res) => {
  const result = await syncScrapmeData({
    scope: req.body.scope || 'all',
    // Environment dry-run is a hard safety switch; a request cannot disable it.
    dryRun: process.env.DRY_RUN === 'true' || req.body.dryRun === true,
  });
  res.json({ success: true, ...result });
});
