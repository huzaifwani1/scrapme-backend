const Customer = require('../models/Customer');
const CustomerEvent = require('../models/CustomerEvent');
const { connectScrapmeDatabase } = require('../config/scrapmeDatabase');
const { getScrapmeSourceModels } = require('./scrapmeSourceModels');

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeEmail(value) {
  return stringValue(value).toLowerCase();
}

function normalizePhone(value) {
  const cleaned = stringValue(value).replace(/[^\d+]/g, '');
  return cleaned === '-' ? '' : cleaned;
}

function idOf(value) {
  return value ? String(value._id || value) : '';
}

function dateOr(value, fallback) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : fallback;
}

function isValidRevenue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0;
}

function earlier(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

function later(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

function sourceAttribution(requests) {
  // Attribution is only imported from the earliest explicitly timestamped
  // attributed request. This removes any dependence on database return order.
  const attributed = requests
    .filter((request) => (stringValue(request.influencerId) || stringValue(request.referralCode)) && dateOr(request.createdAt, null))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || idOf(a).localeCompare(idOf(b)))[0];
  if (!attributed) return {};
  if (stringValue(attributed.influencerId)) {
    return { influencerId: stringValue(attributed.influencerId), acquisitionSource: 'influencer', acquisitionMedium: 'influencer' };
  }
  return { referralCode: stringValue(attributed.referralCode), acquisitionSource: 'referral', acquisitionMedium: 'referral' };
}

function sourceEventsForPickup(order, customerId) {
  const orderId = idOf(order);
  const base = {
    customerId,
    scrapmePickupOrderId: orderId,
    source: 'scrapme_sync',
    metadata: { sourceStatus: order.status, orderId: order.orderId || null, finalPrice: order.finalPrice ?? null },
  };
  const events = [];
  const assignedAt = dateOr(order.startedAt, null);
  const pickedUpAt = dateOr(order.pickedUpAt, null) || dateOr(order.completedAt, null);
  const completedAt = dateOr(order.completedAt, null);
  if (assignedAt) {
    events.push({ ...base, eventType: 'pickup_assigned', timestamp: assignedAt, sourceEventKey: `pickup:${orderId}:pickup_assigned` });
  }
  if (pickedUpAt) {
    events.push({ ...base, eventType: 'pickup_completed', timestamp: pickedUpAt, sourceEventKey: `pickup:${orderId}:pickup_completed` });
  }
  // Payment requires explicit completion, time, and a real positive final price.
  if (order.status === 'completed' && completedAt && isValidRevenue(order.finalPrice)) {
    events.push({ ...base, eventType: 'payment_completed', timestamp: completedAt, sourceEventKey: `pickup:${orderId}:payment_completed` });
  }
  return events;
}

function createMongooseRepository() {
  return {
    async findCustomer({ scrapmeUserId, email, phone }) {
      if (scrapmeUserId) {
        const match = await Customer.findOne({ scrapmeUserId });
        if (match) return match;
      }
      if (email) {
        const match = await Customer.findOne({ email });
        if (match) return match;
      }
      if (phone) {
        const exact = await Customer.findOne({ phone });
        if (exact) return exact;
        // Existing Phase 1 records may predate phone normalisation. Fall back
        // to a normalized comparison so a sync never creates a duplicate.
        const candidates = await Customer.find({ phone: { $exists: true, $ne: null } }).select('phone');
        return candidates.find((candidate) => normalizePhone(candidate.phone) === phone) || null;
      }
      return null;
    },
    async saveCustomer(customer, changes, isNew) {
      if (isNew) return Customer.create(changes);
      Object.assign(customer, changes);
      return customer.save();
    },
    async hasEvent(sourceEventKey) {
      return Boolean(await CustomerEvent.exists({ sourceEventKey }));
    },
    async createEvent(event) {
      return CustomerEvent.create(event);
    },
  };
}

async function readSourceData(sourceModels) {
  const [users, requests, pickupOrders] = await Promise.all([
    sourceModels.User.find({}),
    sourceModels.Request.find({}),
    sourceModels.PickupOrder.find({}),
  ]);
  return { users, requests, pickupOrders };
}

function customerChanges(user, existing, relatedRequests, relatedOrders) {
  const userId = idOf(user);
  const sourceCreated = dateOr(user.createdAt, null);
  const activityDates = [user.updatedAt, ...relatedRequests.map((r) => r.updatedAt), ...relatedOrders.map((o) => o.updatedAt)]
    .map((value) => dateOr(value, null)).filter(Boolean);
  const inferredAttribution = sourceAttribution(relatedRequests);
  const completedOrders = relatedOrders.filter((order) => order.status === 'completed');
  const revenue = completedOrders.reduce((sum, order) => {
    const price = Number(order.finalPrice);
    return isValidRevenue(order.finalPrice) ? sum + price : sum;
  }, 0);

  const changes = {
    scrapmeUserId: userId,
    // Null is intentional when source history has no explicit timestamp.
    // It prevents Mongoose defaults from inventing a current-time history.
    firstSeenAt: earlier(existing && existing.firstSeenAt, sourceCreated) || null,
    lastActivityAt: later(existing && existing.lastActivityAt, later(...activityDates)) || null,
    totalOrders: relatedRequests.length,
    completedOrders: completedOrders.length,
    totalRevenue: revenue,
  };
  ['name', 'email', 'phone'].forEach((field) => {
    const value = field === 'email' ? normalizeEmail(user[field]) : field === 'phone' ? normalizePhone(user[field]) : stringValue(user[field]);
    if (value && (!existing || !stringValue(existing[field]) || stringValue(existing[field]) === '-')) changes[field] = value;
  });
  // Every existing attribution value wins, including `direct`.
  if (inferredAttribution.influencerId && (!existing || !stringValue(existing.influencerId))) changes.influencerId = inferredAttribution.influencerId;
  if (inferredAttribution.referralCode && (!existing || !stringValue(existing.referralCode))) changes.referralCode = inferredAttribution.referralCode;
  if (inferredAttribution.acquisitionSource && (!existing || !stringValue(existing.acquisitionSource))) changes.acquisitionSource = inferredAttribution.acquisitionSource;
  if (inferredAttribution.acquisitionMedium && (!existing || !stringValue(existing.acquisitionMedium))) changes.acquisitionMedium = inferredAttribution.acquisitionMedium;
  return changes;
}

function changed(existing, changes) {
  if (!existing) return true;
  return Object.entries(changes).some(([key, value]) => String(existing[key] ?? '') !== String(value ?? ''));
}

/**
 * Synchronises only read data from ScrapMe. Inject `sourceData` and `repository`
 * for deterministic integration tests; production uses the two Mongo connections.
 */
async function syncScrapmeData({ scope = 'all', dryRun = false, sourceData, repository } = {}) {
  const validScopes = ['customers', 'requests', 'pickup_orders', 'all'];
  if (!validScopes.includes(scope)) throw new Error('Invalid sync scope');
  const source = sourceData || await readSourceData(getScrapmeSourceModels(await connectScrapmeDatabase()));
  const repo = repository || createMongooseRepository();
  const result = { dryRun, customersProcessed: 0, customersCreated: 0, customersUpdated: 0, eventsCreated: 0, recordsUnmapped: 0, validationErrors: 0, errors: 0, errorDetails: [] };
  const report = (recordType, sourceId, stage, reason, message) => {
    result.errors += 1;
    result.errorDetails.push({ recordType, sourceId: stringValue(sourceId).slice(0, 128), stage, reason, message });
  };
  const requestsByUser = new Map();
  source.requests.forEach((request) => {
    const userId = idOf(request.userId);
    if (!requestsByUser.has(userId)) requestsByUser.set(userId, []);
    requestsByUser.get(userId).push(request);
  });
  const ordersByRequest = new Map();
  source.pickupOrders.forEach((order) => {
    const requestId = idOf(order.requestId);
    if (!ordersByRequest.has(requestId)) ordersByRequest.set(requestId, []);
    ordersByRequest.get(requestId).push(order);
  });

  const customersBySourceId = new Map();
  // Customer profiles are always resolved before events so a narrow event scope is safe.
  for (const user of source.users) {
    try {
      const userId = idOf(user);
      const requests = requestsByUser.get(userId) || [];
      const orders = requests.flatMap((request) => ordersByRequest.get(idOf(request)) || []);
      const existing = await repo.findCustomer({ scrapmeUserId: userId, email: normalizeEmail(user.email), phone: normalizePhone(user.phone) });
      const changes = customerChanges(user, existing, requests, orders);
      const isNew = !existing;
      result.customersProcessed += 1;
      if (isNew) result.customersCreated += 1;
      else if (changed(existing, changes)) result.customersUpdated += 1;
      let customer;
      if (dryRun) customer = { ...(existing || {}), ...changes, _id: existing ? existing._id : `dry:${userId}` };
      else {
        try {
          customer = await repo.saveCustomer(existing, changes, isNew);
        } catch (error) {
          // A concurrent sync may have created the same unique customer first.
          if (error && error.code === 11000) {
            customer = await repo.findCustomer({ scrapmeUserId: userId, email: normalizeEmail(user.email), phone: normalizePhone(user.phone) });
            if (!customer) throw error;
          } else throw error;
        }
      }
      customersBySourceId.set(userId, customer);
    } catch (error) {
      result.validationErrors += 1;
      report('customer', idOf(user), 'customer_sync', error && error.code === 11000 ? 'duplicate_key' : 'customer_sync_failed', 'Customer record could not be synchronized.');
    }
  }

  async function recordEvent(event) {
    if (await repo.hasEvent(event.sourceEventKey)) return;
    result.eventsCreated += 1;
    if (!dryRun) {
      try { await repo.createEvent(event); }
      catch (error) {
        // A unique sourceEventKey conflict is an idempotent concurrent write.
        if (!(error && error.code === 11000)) throw error;
        result.eventsCreated -= 1;
      }
    }
  }

  if (scope === 'requests' || scope === 'all') {
    for (const request of source.requests) {
      const customer = customersBySourceId.get(idOf(request.userId));
      if (!customer) { result.recordsUnmapped += 1; report('request', idOf(request), 'event_sync', 'customer_not_found', 'Request could not be mapped to a synchronized customer.'); continue; }
      try {
        const requestId = idOf(request);
        const timestamp = dateOr(request.createdAt, null);
        if (!timestamp) { report('request', requestId, 'event_sync', 'missing_timestamp', 'Request has no explicit creation timestamp; event skipped.'); continue; }
        await recordEvent({ customerId: customer._id, scrapmeRequestId: requestId, eventType: 'request_submitted', source: 'scrapme_sync', timestamp, sourceEventKey: `request:${requestId}:request_submitted`, metadata: { sourceStatus: request.status, price: request.priceNum ?? request.price ?? null } });
      } catch (error) { report('request', idOf(request), 'event_sync', error && error.code === 11000 ? 'duplicate_key' : 'event_sync_failed', 'Request event could not be synchronized.'); }
    }
  }

  if (scope === 'pickup_orders' || scope === 'all') {
    for (const order of source.pickupOrders) {
      const request = source.requests.find((candidate) => idOf(candidate) === idOf(order.requestId));
      const customer = request && customersBySourceId.get(idOf(request.userId));
      if (!customer) { result.recordsUnmapped += 1; report('pickup_order', idOf(order), 'event_sync', 'customer_not_found', 'Pickup order could not be mapped to a synchronized customer.'); continue; }
      const events = sourceEventsForPickup(order, customer._id);
      if (!events.length) report('pickup_order', idOf(order), 'event_sync', 'missing_event_evidence', 'Pickup order has no explicit timestamped event evidence.');
      for (const event of events) {
        try { await recordEvent(event); } catch (error) { report('pickup_order', idOf(order), 'event_sync', error && error.code === 11000 ? 'duplicate_key' : 'event_sync_failed', 'Pickup event could not be synchronized.'); }
      }
    }
  }
  return result;
}

module.exports = { syncScrapmeData, normalizeEmail, normalizePhone, sourceEventsForPickup, isValidRevenue };
