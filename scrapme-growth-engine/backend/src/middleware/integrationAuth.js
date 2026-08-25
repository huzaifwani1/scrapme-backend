const crypto = require('crypto');

// Temporary protection for the internal sync endpoint. Replace this with the
// Growth Engine's proper admin RBAC before exposing the endpoint publicly.
function integrationAuth(req, res, next) {
  const configuredToken = process.env.INTEGRATION_SYNC_TOKEN;
  if (!configuredToken) {
    return res.status(503).json({ success: false, error: 'Integration sync is not configured' });
  }

  const supplied = req.get('x-integration-token') || '';
  const expected = Buffer.from(configuredToken);
  const received = Buffer.from(supplied);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ success: false, error: 'Integration authorization required' });
  }
  next();
}

module.exports = integrationAuth;
