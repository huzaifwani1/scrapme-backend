const Customer = require('../models/Customer');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/customers
 * List customers with pagination.
 */
exports.listCustomers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.customerStatus = req.query.status;
  if (req.query.source) filter.acquisitionSource = req.query.source;

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Customer.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: customers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/customers/:id
 * Get a single customer by ID.
 */
exports.getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id).select('-__v');
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }
  res.json({ success: true, data: customer });
});

/**
 * POST /api/customers
 * Create a new customer record.
 */
exports.createCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.create(req.body);
  res.status(201).json({ success: true, data: customer });
});
