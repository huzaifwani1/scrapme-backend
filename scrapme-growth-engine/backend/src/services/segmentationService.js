const Customer = require('../models/Customer');
const CustomerEvent = require('../models/CustomerEvent');
const CustomerSegment = require('../models/CustomerSegment');
const { getSegmentationConfig } = require('../config/segmentation');

const SEGMENT_NAMES = {
  new_customer: 'New Customer', first_time_seller: 'First-Time Seller', repeat_seller: 'Repeat Seller',
  high_value_customer: 'High-Value Customer', abandoned_request: 'Abandoned Request',
  never_completed: 'Never Completed', inactive_customer: 'Inactive Customer', dormant_customer: 'Dormant Customer',
  reactivated_customer: 'Reactivated Customer', acquired_google: 'Google Acquired',
  acquired_instagram: 'Instagram Acquired', acquired_influencer: 'Influencer Acquired',
  acquired_direct: 'Direct Acquired', acquired_referral: 'Referral Acquired', influencer_acquired: 'Influencer Customer',
};

const MEANINGFUL_REACTIVATION_EVENTS = [
  'quote_created', 'request_started', 'request_submitted', 'pickup_assigned',
  'pickup_completed', 'payment_completed', 'review_submitted', 'referral_click',
];

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function daysBetween(older, newer) {
  return Math.floor((newer.getTime() - older.getTime()) / 86400000);
}

function assignment(segmentKey, reason, metadata = {}) {
  return { segmentKey, segmentName: SEGMENT_NAMES[segmentKey], reason, metadata };
}

function validRevenue(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

/**
 * Pure deterministic segment calculation. `context` is built with indexed
 * event queries; only timestamps and aggregate flags are required.
 */
function calculateCustomerSegments(customer, context = {}, configOverrides = {}) {
  const config = getSegmentationConfig(configOverrides);
  const now = validDate(context.now) || new Date();
  const segments = [];
  const completedOrders = Number(customer.completedOrders) || 0;
  const totalRevenue = validRevenue(customer.totalRevenue);
  const firstSeenAt = validDate(customer.firstSeenAt);
  const lastActivityAt = validDate(customer.lastActivityAt);
  const eventCount = Number(context.eventCount) || 0;

  if (firstSeenAt && daysBetween(firstSeenAt, now) <= config.newCustomerDays && completedOrders === 0) {
    segments.push(assignment('new_customer', `Entered the Growth Engine ${daysBetween(firstSeenAt, now)} days ago with no completed orders`, { ageDays: daysBetween(firstSeenAt, now) }));
  }
  if (completedOrders === 1) segments.push(assignment('first_time_seller', 'Customer has completed 1 order', { completedOrders }));
  if (completedOrders >= 2) segments.push(assignment('repeat_seller', `Customer has completed ${completedOrders} orders`, { completedOrders }));
  if (totalRevenue !== null && totalRevenue >= config.highValueRevenueThreshold) segments.push(assignment('high_value_customer', `Revenue of ${totalRevenue} meets the ${config.highValueRevenueThreshold} threshold`, { totalRevenue, threshold: config.highValueRevenueThreshold }));
  if (context.hasAbandonedRequest) segments.push(assignment('abandoned_request', 'Customer has a recorded request_abandoned event'));
  if ((Number(customer.totalOrders) > 0 || eventCount > 0) && completedOrders === 0) segments.push(assignment('never_completed', 'Customer has activity or request history but no completed orders', { totalOrders: Number(customer.totalOrders) || 0, eventCount }));

  if (lastActivityAt) {
    const inactiveDays = daysBetween(lastActivityAt, now);
    // Dormant is intentionally exclusive with inactive: it is the longer inactivity state.
    if (inactiveDays >= config.dormantDays) segments.push(assignment('dormant_customer', `No meaningful activity for ${inactiveDays} days`, { inactiveDays }));
    else if (inactiveDays >= config.inactiveDays) segments.push(assignment('inactive_customer', `No meaningful activity for ${inactiveDays} days`, { inactiveDays }));
  }

  const [latest, previous] = (context.recentEventTimestamps || []).map(validDate);
  if (latest && previous && daysBetween(previous, latest) >= config.inactiveDays && daysBetween(latest, now) < config.inactiveDays) {
    segments.push(assignment('reactivated_customer', `Recorded activity resumed after ${daysBetween(previous, latest)} inactive days`, { inactiveGapDays: daysBetween(previous, latest), reactivatedAt: latest.toISOString() }));
  }

  const source = String(customer.acquisitionSource || '').trim().toLowerCase();
  const sourceSegments = { google: 'acquired_google', instagram: 'acquired_instagram', influencer: 'acquired_influencer', direct: 'acquired_direct', referral: 'acquired_referral' };
  if (sourceSegments[source]) segments.push(assignment(sourceSegments[source], `Acquisition source recorded as ${source}`, { acquisitionSource: source }));
  if (customer.influencerId) segments.push(assignment('influencer_acquired', 'Customer has a recorded influencer attribution', { influencerId: String(customer.influencerId) }));
  return segments;
}

async function eventContexts(customerIds, models = { CustomerEvent }) {
  if (!customerIds.length) return new Map();
  // Two aggregation queries per customer batch—not per customer. Both read
  // only indexed event fields and never hydrate complete event documents.
  const [stats, meaningful] = await Promise.all([
    models.CustomerEvent.aggregate([
      { $match: { customerId: { $in: customerIds } } },
      { $group: {
        _id: '$customerId',
        eventCount: { $sum: 1 },
        abandonedCount: { $sum: { $cond: [{ $eq: ['$eventType', 'request_abandoned'] }, 1, 0] } },
      } },
    ]),
    models.CustomerEvent.aggregate([
      { $match: { customerId: { $in: customerIds }, eventType: { $in: MEANINGFUL_REACTIVATION_EVENTS }, timestamp: { $type: 'date' } } },
      { $group: { _id: '$customerId', recentEventTimestamps: { $topN: { output: '$timestamp', sortBy: { timestamp: -1 }, n: 2 } } } },
    ]),
  ]);
  const contexts = new Map(customerIds.map((id) => [String(id), { eventCount: 0, hasAbandonedRequest: false, recentEventTimestamps: [] }]));
  stats.forEach((item) => contexts.set(String(item._id), { ...(contexts.get(String(item._id)) || {}), eventCount: item.eventCount, hasAbandonedRequest: item.abandonedCount > 0 }));
  meaningful.forEach((item) => contexts.set(String(item._id), { ...(contexts.get(String(item._id)) || {}), recentEventTimestamps: item.recentEventTimestamps }));
  return contexts;
}

async function eventContext(customerId, models = { CustomerEvent }) {
  return (await eventContexts([customerId], models)).get(String(customerId));
}

function safeError(recordType, sourceId, stage, error) {
  return { recordType, sourceId: String(sourceId || '').slice(0, 128), stage, reason: error && error.code === 11000 ? 'duplicate_key' : 'segment_refresh_failed', message: 'Customer segments could not be refreshed.' };
}

async function refreshOneCustomer(customer, context, { models, configOverrides, now }) {
  const assignments = calculateCustomerSegments(customer, { ...context, now }, configOverrides);
  const keys = assignments.map((item) => item.segmentKey);
  await models.CustomerSegment.deleteMany({ customerId: customer._id, segmentKey: { $nin: keys } });
  for (const item of assignments) {
    await models.CustomerSegment.findOneAndUpdate(
      { customerId: customer._id, segmentKey: item.segmentKey },
      { $set: { ...item, calculatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  return assignments.length;
}

async function refreshSegments({ scope = 'all', customerId, customerIds, batchSize = 250, configOverrides, now, models = { Customer, CustomerEvent, CustomerSegment } } = {}) {
  if (!['all', 'customer', 'batch'].includes(scope)) throw new Error('Invalid segment refresh scope');
  if (scope === 'customer' && !customerId) throw new Error('customerId is required for customer scope');
  if (scope === 'batch' && (!Array.isArray(customerIds) || !customerIds.length)) throw new Error('customerIds are required for batch scope');
  // Validate once before querying or modifying any segment records.
  getSegmentationConfig(configOverrides);
  const filter = scope === 'customer' ? { _id: customerId } : scope === 'batch' ? { _id: { $in: customerIds } } : {};
  const result = { customersProcessed: 0, customersNotFound: 0, segmentsCalculated: 0, errors: 0, errorDetails: [] };
  let lastId = null;
  do {
    const pageFilter = scope === 'all' && lastId ? { ...filter, _id: { $gt: lastId } } : filter;
    const customers = await models.Customer.find(pageFilter).sort({ _id: 1 }).limit(batchSize).lean();
    if (!customers.length) break;
    const contexts = await eventContexts(customers.map((customer) => customer._id), models);
    for (const customer of customers) {
      try {
        result.customersProcessed += 1;
        result.segmentsCalculated += await refreshOneCustomer(customer, contexts.get(String(customer._id)), { models, configOverrides, now });
      } catch (error) {
        result.errors += 1;
        result.errorDetails.push(safeError('customer', customer._id, 'segment_refresh', error));
      }
    }
    lastId = customers[customers.length - 1]._id;
    if (scope !== 'all') break;
  } while (true);
  if (scope === 'customer' && result.customersProcessed === 0) result.customersNotFound = 1;
  return result;
}

module.exports = { SEGMENT_NAMES, MEANINGFUL_REACTIVATION_EVENTS, calculateCustomerSegments, refreshSegments, eventContext, eventContexts, validRevenue };
