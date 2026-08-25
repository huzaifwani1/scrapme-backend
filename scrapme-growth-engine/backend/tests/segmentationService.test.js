const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Customer = require('../src/models/Customer');
const CustomerEvent = require('../src/models/CustomerEvent');
const CustomerSegment = require('../src/models/CustomerSegment');
const app = require('../src/app');
const { calculateCustomerSegments, refreshSegments, eventContext } = require('../src/services/segmentationService');
const { getSegmentationConfig } = require('../src/config/segmentation');

const NOW = new Date('2027-01-01T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000);
const keys = (segments) => segments.map((segment) => segment.segmentKey);

describe('Customer intelligence rules', () => {
  it('classifies supported value, activity, attribution, and overlapping segments', () => {
    const segments = calculateCustomerSegments({ completedOrders: 2, totalOrders: 3, totalRevenue: 15000, lastActivityAt: ago(45), acquisitionSource: 'google', influencerId: 'inf-1' }, {
      now: NOW, eventCount: 4, hasAbandonedRequest: true, recentEventTimestamps: [ago(2), ago(40)],
    });
    expect(keys(segments)).toEqual(expect.arrayContaining(['repeat_seller', 'high_value_customer', 'abandoned_request', 'inactive_customer', 'reactivated_customer', 'acquired_google', 'influencer_acquired']));
  });

  it('handles new, first-time, never-completed, dormant, and all supported acquisition sources', () => {
    expect(keys(calculateCustomerSegments({ firstSeenAt: ago(3), completedOrders: 0, totalOrders: 1, acquisitionSource: 'direct' }, { now: NOW, eventCount: 1 }))).toEqual(expect.arrayContaining(['new_customer', 'never_completed', 'acquired_direct']));
    expect(keys(calculateCustomerSegments({ completedOrders: 1, totalRevenue: 10, acquisitionSource: 'instagram' }, { now: NOW }))).toEqual(expect.arrayContaining(['first_time_seller', 'acquired_instagram']));
    expect(keys(calculateCustomerSegments({ completedOrders: 0, lastActivityAt: ago(100), acquisitionSource: 'influencer' }, { now: NOW }))).toEqual(expect.arrayContaining(['dormant_customer', 'acquired_influencer']));
    expect(keys(calculateCustomerSegments({ completedOrders: 0, acquisitionSource: 'referral' }, { now: NOW }))).toContain('acquired_referral');
  });

  it('uses configurable thresholds and avoids segments from missing or malformed data', () => {
    const configured = calculateCustomerSegments({ firstSeenAt: ago(8), completedOrders: 0, totalRevenue: 500 }, { now: NOW }, { newCustomerDays: 7, highValueRevenueThreshold: 500 });
    expect(keys(configured)).toContain('high_value_customer');
    expect(keys(configured)).not.toContain('new_customer');
    expect(keys(calculateCustomerSegments({ firstSeenAt: 'bad-date', lastActivityAt: null, completedOrders: 0 }, { now: NOW }))).toEqual([]);
  });

  it('rejects invalid revenue and invalid inactivity configuration', () => {
    [null, undefined, '', ' ', 'not-a-number', NaN, Infinity, -Infinity, -1].forEach((totalRevenue) => {
      expect(keys(calculateCustomerSegments({ totalRevenue }, { now: NOW }))).not.toContain('high_value_customer');
    });
    expect(keys(calculateCustomerSegments({ totalRevenue: 10000 }, { now: NOW }))).toContain('high_value_customer');
    expect(() => getSegmentationConfig({ inactiveDays: 90, dormantDays: 90 })).toThrow('DORMANT_DAYS must be greater than INACTIVE_DAYS');
  });
});

describe('Segment refresh and query APIs using non-production MongoDB', () => {
  let mongo;
  let customerA;
  let customerB;
  const originalToken = process.env.INTEGRATION_SYNC_TOKEN;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([Customer.syncIndexes(), CustomerEvent.syncIndexes(), CustomerSegment.syncIndexes()]);
    customerA = await Customer.create({ name: 'A', completedOrders: 1, totalOrders: 1, totalRevenue: 500, firstSeenAt: ago(2), lastActivityAt: ago(1), acquisitionSource: 'direct' });
    customerB = await Customer.create({ name: 'B', completedOrders: 0, totalOrders: 1, firstSeenAt: ago(100), lastActivityAt: ago(50), acquisitionSource: 'referral' });
    await CustomerEvent.create({ customerId: customerB._id, eventType: 'request_abandoned', timestamp: ago(50), sourceEventKey: 'phase3:abandoned' });
  });

  afterAll(async () => {
    if (originalToken === undefined) delete process.env.INTEGRATION_SYNC_TOKEN;
    else process.env.INTEGRATION_SYNC_TOKEN = originalToken;
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('refreshes one customer, batch, and all without duplicate assignments', async () => {
    const one = await refreshSegments({ scope: 'customer', customerId: customerA._id, now: NOW });
    expect(one).toMatchObject({ customersProcessed: 1, errors: 0 });
    const afterOne = await CustomerSegment.countDocuments({ customerId: customerA._id });
    const batch = await refreshSegments({ scope: 'batch', customerIds: [customerA._id, customerB._id], now: NOW });
    expect(batch).toMatchObject({ customersProcessed: 2, errors: 0 });
    expect(await CustomerSegment.countDocuments({ customerId: customerA._id })).toBe(afterOne);
    const all = await refreshSegments({ scope: 'all', now: NOW, batchSize: 1 });
    expect(all).toMatchObject({ customersProcessed: 2, errors: 0 });
    expect(await CustomerSegment.countDocuments({ customerId: customerB._id, segmentKey: 'abandoned_request' })).toBe(1);
  });

  it('fails before refresh work when inactivity configuration is invalid', async () => {
    await expect(refreshSegments({ scope: 'customer', customerId: customerA._id, configOverrides: { inactiveDays: 90, dormantDays: 30 } })).rejects.toThrow('DORMANT_DAYS must be greater than INACTIVE_DAYS');
  });

  it('uses only meaningful events for reactivation and aggregates event data once per batch', async () => {
    const pageVisitOnly = await Customer.create({ name: 'Visits only', lastActivityAt: ago(1) });
    await CustomerEvent.insertMany([
      { customerId: pageVisitOnly._id, eventType: 'page_visit', timestamp: ago(40), sourceEventKey: 'phase3:visit:old' },
      { customerId: pageVisitOnly._id, eventType: 'page_visit', timestamp: ago(1), sourceEventKey: 'phase3:visit:new' },
    ]);
    expect(keys(calculateCustomerSegments(pageVisitOnly.toObject(), { ...(await eventContext(pageVisitOnly._id)), now: NOW }))).not.toContain('reactivated_customer');

    const mixed = await Customer.create({ name: 'Mixed', lastActivityAt: ago(1) });
    await CustomerEvent.insertMany([
      { customerId: mixed._id, eventType: 'request_submitted', timestamp: ago(40), sourceEventKey: 'phase3:mixed:meaningful-old' },
      { customerId: mixed._id, eventType: 'page_visit', timestamp: ago(1), sourceEventKey: 'phase3:mixed:visit-new' },
    ]);
    expect(keys(calculateCustomerSegments(mixed.toObject(), { ...(await eventContext(mixed._id)), now: NOW }))).not.toContain('reactivated_customer');
    await CustomerEvent.create({ customerId: mixed._id, eventType: 'payment_completed', timestamp: ago(1), sourceEventKey: 'phase3:mixed:meaningful-new' });
    expect(keys(calculateCustomerSegments(mixed.toObject(), { ...(await eventContext(mixed._id)), now: NOW }))).toContain('reactivated_customer');

    const insufficient = await Customer.create({ name: 'Insufficient', lastActivityAt: ago(1) });
    await CustomerEvent.insertMany([
      { customerId: insufficient._id, eventType: 'request_submitted', timestamp: ago(20), sourceEventKey: 'phase3:short:old' },
      { customerId: insufficient._id, eventType: 'payment_completed', timestamp: ago(1), sourceEventKey: 'phase3:short:new' },
    ]);
    expect(keys(calculateCustomerSegments(insufficient.toObject(), { ...(await eventContext(insufficient._id)), now: NOW }))).not.toContain('reactivated_customer');

    const aggregateSpy = jest.spyOn(CustomerEvent, 'aggregate');
    await refreshSegments({ scope: 'batch', customerIds: [customerA._id, customerB._id], now: NOW });
    expect(aggregateSpy).toHaveBeenCalledTimes(2);
    aggregateSpy.mockRestore();
  });

  it('enforces the customerId and segmentKey uniqueness constraint in MongoDB', async () => {
    await CustomerSegment.create({ customerId: customerA._id, segmentKey: 'manual-test', segmentName: 'Manual Test', reason: 'Index verification', calculatedAt: NOW });
    await expect(CustomerSegment.create({ customerId: customerA._id, segmentKey: 'manual-test', segmentName: 'Manual Test', reason: 'Duplicate', calculatedAt: NOW })).rejects.toMatchObject({ code: 11000 });
  });

  it('creates the customerId/timestamp event index used by batched event queries', async () => {
    const indexes = await CustomerEvent.collection.indexes();
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ key: { customerId: 1, timestamp: -1 } })]));
  });

  it('filters segments, summarizes existing counts, and requires authentication', async () => {
    delete process.env.INTEGRATION_SYNC_TOKEN;
    expect((await request(app).get('/api/segments/summary')).status).toBe(503);
    process.env.INTEGRATION_SYNC_TOKEN = 'segments-test-token';
    const summary = await request(app).get('/api/segments/summary').set('x-integration-token', 'segments-test-token');
    expect(summary.status).toBe(200);
    expect(summary.body.data).toHaveProperty('first_time_seller', 1);
    const list = await request(app).get('/api/segments').query({ segmentKey: 'abandoned_request', customerId: customerB._id.toString() }).set('x-integration-token', 'segments-test-token');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ segmentKey: 'abandoned_request' });
    const refresh = await request(app).post('/api/segments/refresh').set('x-integration-token', 'segments-test-token').send({ scope: 'customer', customerId: customerA._id.toString() });
    expect(refresh.status).toBe(200);
    expect(refresh.body.data).toMatchObject({ customersProcessed: 1, errors: 0 });
  });
});
