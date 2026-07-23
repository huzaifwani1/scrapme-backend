const jwt = require('jsonwebtoken');

const SSE_COOKIE_NAME = 'scrapme_sse_session';
const SSE_SESSION_TTL_SECONDS = 15 * 60;

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, item) => {
    const separator = item.indexOf('=');
    if (separator === -1) return cookies;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function readBearerToken(req) {
  return req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
}

function verifyApplicationToken(token) {
  if (!token) return null;

  try {
    const partner = jwt.verify(token, process.env.JWT_SECRET);
    if (['partner', 'warehouse'].includes(partner.role)) {
      return { id: String(partner.id), role: partner.role, name: partner.name };
    }
  } catch (_) {
    // The token may belong to an admin; verify it with the admin secret below.
  }

  try {
    const admin = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (admin.role === 'admin') {
      return { id: admin.username, role: 'admin', name: admin.username };
    }
  } catch (_) {
    return null;
  }

  return null;
}

function sseSessionSecret() {
  return process.env.SSE_JWT_SECRET || process.env.JWT_SECRET;
}

function issueSseSession(req, res) {
  const principal = verifyApplicationToken(readBearerToken(req));
  if (!principal) {
    return res.status(401).json({ message: 'A valid partner, warehouse, or admin token is required' });
  }

  const token = jwt.sign(
    { id: principal.id, role: principal.role, name: principal.name, purpose: 'sse' },
    sseSessionSecret(),
    { expiresIn: SSE_SESSION_TTL_SECONDS }
  );

  res.cookie(SSE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: SSE_SESSION_TTL_SECONDS * 1000,
    path: '/api/operations/events'
  });
  return res.json({ message: 'SSE session established' });
}

function requireSseSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SSE_COOKIE_NAME];
  if (!token) return res.status(401).json({ message: 'SSE authentication required' });

  try {
    const principal = jwt.verify(token, sseSessionSecret());
    if (principal.purpose !== 'sse' || !['partner', 'warehouse', 'admin'].includes(principal.role)) {
      throw new Error('Invalid SSE session');
    }
    req.ssePrincipal = { id: String(principal.id), role: principal.role, name: principal.name };
    return next();
  } catch (_) {
    return res.status(401).json({ message: 'Invalid or expired SSE session' });
  }
}

module.exports = { issueSseSession, requireSseSession };
