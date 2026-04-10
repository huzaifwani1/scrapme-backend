const jwt = require('jsonwebtoken');

const adminProtect = (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ message: 'Admin auth required' });
  try {
    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Not an admin' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Admin token invalid' });
  }
};

module.exports = { adminProtect };
