const jwt = require('jsonwebtoken');
const Influencer = require('../models/Influencer');

const influencerProtect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ message: 'Influencer authentication is required' });
  }
  
  try {
    const secret = process.env.JWT_SECRET || 'scrapme_jwt_secret_2026';
    const decoded = jwt.verify(token, secret);
    
    const influencer = await Influencer.findById(decoded.id || decoded._id);
    if (!influencer) {
      return res.status(404).json({ message: 'Influencer account not found' });
    }
    if (!influencer.isActive) {
      return res.status(403).json({ message: 'Influencer account is inactive' });
    }
    if (influencer.isLoginEnabled === false) {
      return res.status(403).json({ message: 'Login is disabled for this influencer account' });
    }

    // Automatically update last active timestamp (without triggering password validation etc)
    influencer.lastActive = new Date();
    await Influencer.updateOne({ _id: influencer._id }, { lastActive: influencer.lastActive });

    req.influencer = influencer;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Session expired or token invalid' });
  }
};

module.exports = { influencerProtect };
