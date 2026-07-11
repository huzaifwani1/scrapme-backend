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

    const secret = process.env.ADMIN_JWT_SECRET;
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

/* ─── USER DATA MODULE CONTROLLERS ────────────────── */
const adminGetUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all'; // all, today, 7days, 30days
    const isExport = req.query.export === 'true';

    // 1. Build Query
    let queryObj = {};

    // Filter by Registration Date
    if (filter === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      queryObj.createdAt = { $gte: startOfToday };
    } else if (filter === '7days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      queryObj.createdAt = { $gte: sevenDaysAgo };
    } else if (filter === '30days') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      queryObj.createdAt = { $gte: thirtyDaysAgo };
    }

    // Search by Name, Email, Phone, Address
    if (search.trim() !== '') {
      // Escape special PCRE chars so that e.g. "+91..." phone numbers don't break MongoDB regex
      const escapedSearch = search.trim().replace(/[\^$.*+?()[\]{}|\\]/g, '\\$&');
      const regexSearch = { $regex: escapedSearch, $options: 'i' };

      // Also look for phone/address matches in Request model (for users not yet migrated)
      const matchingUserIds = await Request.distinct('userId', {
        $or: [
          { phone: regexSearch },
          { address: regexSearch }
        ]
      });

      queryObj.$or = [
        { name: regexSearch },
        { email: regexSearch },
        { phone: regexSearch },
        { address: regexSearch },
        { _id: { $in: matchingUserIds } }
      ];
    }

    // 2. Fetch Total Count
    const total = await User.countDocuments(queryObj);

    // 3. Fetch Users
    let usersQuery = User.find(queryObj).sort({ createdAt: -1 });
    if (!isExport) {
      usersQuery = usersQuery.skip((page - 1) * limit).limit(limit);
    }
    const users = await usersQuery.lean();

    // 4. Format users — phone and address now live directly on User document.
    //    For users not yet migrated (registered before the migration), fall back
    //    to a batch query on requests.
    const usersNeedingFallback = users.filter(u => !u.phone || u.phone === '-');
    const fallbackReqMap = {};

    if (usersNeedingFallback.length > 0) {
      const fallbackIds = usersNeedingFallback.map(u => u._id);
      const fallbackRequests = await Request.aggregate([
        { $match: { userId: { $in: fallbackIds } } },
        { $sort: { createdAt: -1 } },
        { $group: {
            _id: '$userId',
            phone: { $first: '$phone' },
            address: { $first: '$address' }
          }
        }
      ]);
      fallbackRequests.forEach(r => {
        if (r._id) {
          fallbackReqMap[r._id.toString()] = {
            phone: r.phone || '-',
            address: r.address || '-'
          };
        }
      });
    }

    const formattedUsers = users.map(u => {
      const fallback = fallbackReqMap[u._id.toString()] || {};
      return {
        id: u._id,
        name: u.name || '-',
        email: u.email || '-',
        phone: (u.phone && u.phone !== '-') ? u.phone : (fallback.phone || '-'),
        address: (u.address && u.address !== '-') ? u.address : (fallback.address || '-'),
        createdAt: u.createdAt
      };
    });

    res.json({
      users: formattedUsers,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
};

const adminGetUsersStats = async (req, res, next) => {
  try {
    // 1. Total Users
    const totalUsers = await User.countDocuments({});

    // 2. Today's registrations
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayCount = await User.countDocuments({ createdAt: { $gte: startOfToday } });

    // 3. Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7DaysCount = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    // 4. Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const last30DaysCount = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    // 5. Users with requests
    const requestsAgg = await Request.aggregate([
      { $group: { _id: '$userId' } },
      { $count: 'count' }
    ]);
    const usersWithRequestsCount = requestsAgg.length > 0 ? requestsAgg[0].count : 0;

    // 6. Users without requests
    const usersWithoutRequestsCount = Math.max(0, totalUsers - usersWithRequestsCount);

    res.json({
      totalUsers,
      todayRegistrations: todayCount,
      last7Days: last7DaysCount,
      last30Days: last30DaysCount,
      usersWithRequests: usersWithRequestsCount,
      usersWithoutRequests: usersWithoutRequestsCount
    });
  } catch (err) {
    next(err);
  }
};

const adminGetUserDetails = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Query all requests for this user, sorted by newest first
    const requests = await Request.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    const numRequests = requests.length;
    const latestRequest = numRequests > 0 ? requests[0] : null;

    // Phone/address: Use User document as primary source (populated by migration + forward-fill on each request).
    // Fall back to latest request if the User doc is still missing the field.
    const phone = (user.phone && user.phone !== '-') ? user.phone
      : (latestRequest ? latestRequest.phone || '-' : '-');
    const address = (user.address && user.address !== '-') ? user.address
      : (latestRequest ? latestRequest.address || '-' : '-');
    const latestRequestDetails = latestRequest ? {
      id: latestRequest._id,
      brand: latestRequest.brand,
      model: latestRequest.model,
      storage: latestRequest.storage,
      price: latestRequest.price || latestRequest.priceNum || '—',
      status: latestRequest.status,
      createdAt: latestRequest.createdAt
    } : null;

    res.json({
      user: {
        id: user._id,
        name: user.name || '-',
        email: user.email || '-',
        phone,
        address,
        createdAt: user.createdAt
      },
      numRequests,
      latestRequest: latestRequestDetails
    });
  } catch (err) {
    next(err);
  }
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
  adminGetUsers,
  adminGetUsersStats,
  adminGetUserDetails,
};
