const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Request = require('../models/Request');
const Message = require('../models/Message');
const User = require('../models/User');

const adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validate username
    if (username !== process.env.ADMIN_USERNAME) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    // Validate password against hashed password
    const hashedPassword = process.env.ADMIN_PASSWORD_HASH;
    if (!hashedPassword) {
      return res.status(500).json({ message: 'Admin configuration error' });
    }

    const passwordValid = await bcrypt.compare(password, hashedPassword);
    if (!passwordValid) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    const token = jwt.sign({ role: 'admin', username }, secret, { expiresIn: '1d' });
    res.json({ token });
  } catch (err) { next(err); }
};

const getAllRequests = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = (status && status !== 'all') ? { status } : {};
    const requests = await Request.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
  try {
    const valid = ['pending', 'evaluated', 'approved', 'completed', 'rejected'];
    if (!valid.includes(req.body.status))
      return res.status(400).json({ message: 'Invalid status' });

    const request = await Request.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json(request);
  } catch (err) { next(err); }
};

const getMessages = async (req, res, next) => {
  try {
    const msgs = await Message.find({ requestId: req.params.requestId }).sort({ createdAt: 1 });
    res.json(msgs);
  } catch (err) { next(err); }
};

const sendMessage = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Text required' });
    const time = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    const msg = await Message.create({ requestId: req.params.requestId, from: 'admin', text, time });
    res.status(201).json(msg);
  } catch (err) { next(err); }
};

const getUserCount = async (req, res, next) => {
  try {
    const count = await User.countDocuments({});
    res.json({ count });
  } catch (err) { next(err); }
};

module.exports = { adminLogin, getAllRequests, updateStatus, getMessages, sendMessage, getUserCount };
