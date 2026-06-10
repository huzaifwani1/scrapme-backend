const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Request = require('../models/Request');
const Message = require('../models/Message');
const User = require('../models/User');

/* ─── ADMIN LOGIN ─────────────────────────────────── */
const adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const envUsername     = process.env.ADMIN_USERNAME || 'admin';
    const envPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    let isValid = false;
    if (envPasswordHash) {
      isValid = await bcrypt.compare(password, envPasswordHash) && username === envUsername;
    } else {
      isValid = username === envUsername && password === (process.env.ADMIN_PASSWORD || 'admin123');
    }

    if (!isValid) return res.status(401).json({ message: 'Invalid admin credentials' });

    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    const token  = jwt.sign({ role: 'admin', username }, secret, { expiresIn: '1d' });
    res.json({ token });
  } catch (err) { next(err); }
};

/* ─── GET ALL REQUESTS (paginated + search + filter) ─ */
const getAllRequests = async (req, res, next) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(200, parseInt(req.query.limit) || 50);
    const skip     = (page - 1) * limit;
    const search   = (req.query.search   || '').trim();
    const status   = (req.query.status   || '').trim();
    const reviewed = req.query.reviewed; // 'true' | 'false' | undefined
    const brand    = (req.query.brand    || '').trim();
    const location = (req.query.location || '').trim();

    const filter = {};

    // Status filter
    if (status && status !== 'all') filter.status = status;

    // Reviewed filter
    if (reviewed === 'true')  filter.reviewed = true;
    if (reviewed === 'false') filter.reviewed = false;

    // Brand filter
    if (brand) filter.brand = { $regex: brand, $options: 'i' };

    // Global search (name, phone, address/location, brand, model, _id prefix)
    if (search) {
      const isId = /^[a-f0-9]{24}$/i.test(search);
      if (isId) {
        filter._id = search;
      } else {
        filter.$or = [
          { sellerName: { $regex: search, $options: 'i' } },
          { phone:      { $regex: search, $options: 'i' } },
          { address:    { $regex: search, $options: 'i' } },
          { brand:      { $regex: search, $options: 'i' } },
          { model:      { $regex: search, $options: 'i' } },
          { userEmail:  { $regex: search, $options: 'i' } },
        ];
      }
    }

    // Location filter (applied as extra condition)
    if (location) {
      const locFilter = { address: { $regex: location, $options: 'i' } };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, locFilter];
        delete filter.$or;
      } else {
        Object.assign(filter, locFilter);
      }
    }

    const [requests, total] = await Promise.all([
      Request.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Request.countDocuments(filter),
    ]);

    res.json({
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) { next(err); }
};

/* ─── DASHBOARD STATS ─────────────────────────────── */
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      total, pending, reviewed, unreviewed,
      purchased, contacted, rejected, accepted, completed
    ] = await Promise.all([
      Request.countDocuments({}),
      Request.countDocuments({ status: 'pending' }),
      Request.countDocuments({ reviewed: true }),
      Request.countDocuments({ reviewed: false }),
      Request.countDocuments({ status: 'purchased' }),
      Request.countDocuments({ status: 'contacted' }),
      Request.countDocuments({ status: 'rejected' }),
      Request.countDocuments({ status: 'accepted' }),
      Request.countDocuments({ status: 'completed' }),
    ]);

    const userCount = await User.countDocuments({});

    res.json({ total, pending, reviewed, unreviewed, purchased, contacted, rejected, accepted, completed, users: userCount });
  } catch (err) { next(err); }
};

/* ─── UPDATE STATUS ───────────────────────────────── */
const validStatuses = ['pending', 'evaluated', 'approved', 'completed', 'rejected', 'contacted', 'accepted', 'purchased'];

const updateStatus = async (req, res, next) => {
  try {
    if (!validStatuses.includes(req.body.status))
      return res.status(400).json({ message: 'Invalid status' });

    const request = await Request.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json(request);
  } catch (err) { next(err); }
};

/* ─── UPDATE REVIEWED ─────────────────────────────── */
const updateReviewed = async (req, res, next) => {
  try {
    const reviewed = !!req.body.reviewed;
    const request  = await Request.findByIdAndUpdate(
      req.params.id,
      { reviewed },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json(request);
  } catch (err) { next(err); }
};

/* ─── UPDATE ADMIN NOTES ──────────────────────────── */
const updateAdminNotes = async (req, res, next) => {
  try {
    const adminNotes = (req.body.adminNotes || '').substring(0, 2000);
    const request = await Request.findByIdAndUpdate(
      req.params.id,
      { adminNotes },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json(request);
  } catch (err) { next(err); }
};

/* ─── MESSAGES ────────────────────────────────────── */
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
    const msg  = await Message.create({ requestId: req.params.requestId, from: 'admin', text, time });
    res.status(201).json(msg);
  } catch (err) { next(err); }
};

/* ─── USER COUNT (legacy) ─────────────────────────── */
const getUserCount = async (req, res, next) => {
  try {
    const count = await User.countDocuments({});
    res.json({ count });
  } catch (err) { next(err); }
};

module.exports = {
  adminLogin,
  getAllRequests,
  getDashboardStats,
  updateStatus,
  updateReviewed,
  updateAdminNotes,
  getMessages,
  sendMessage,
  getUserCount,
};
