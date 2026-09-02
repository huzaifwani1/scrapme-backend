const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../src/app');
const Customer = require('../src/models/Customer');
const CustomerEvent = require('../src/models/CustomerEvent');
const CommunicationPreference = require('../src/models/CommunicationPreference');
const intelligenceService = require('../src/services/intelligenceService');

let mongoServer;
const AUTH_TOKEN = 'test_integration_token_intelligence';

beforeAll(async () => {
  process.env.INTEGRATION_SYNC_TOKEN = AUTH_TOKEN;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Customer.deleteMany({});
  await CustomerEvent.deleteMany({});
  await CommunicationPreference.deleteMany({});
});

describe('Phase 7B Customer Intelligence & Next-Best-Action Engine Test Suite', () => {

  test('1. Multiple opportunity candidates evaluated for a customer', async () => {
    const now = new Date('2026-02-01T10:00:00Z');
    const cust = await Customer.create({
      name: 'Multi Candidate User',
      email: 'multi@example.com',
      phone: '9876543210',
      totalRevenue: 1500,
      completedOrders: 1,
      lastActivityAt: new Date('2026-01-01T10:00:00Z'), // 31 days inactive
      createdAt: new Date('2025-12-01T10:00:00Z')
    });

    const candidates = await intelligenceService.evaluateCustomerOpportunities(cust, {}, now);
    const eligibleCandidates = candidates.filter(c => c.isEligible);

    // Eligible for both high_value_reactivation and inactive_customer_followup
    expect(eligibleCandidates.length).toBeGreaterThan(1);
    expect(eligibleCandidates.map(c => c.opportunityType)).toContain('high_value_reactivation');
    expect(eligibleCandidates.map(c => c.opportunityType)).toContain('inactive_customer_followup');
  });

  test('2. Deterministic primary NBA selection picks highest priority score', async () => {
    const now = new Date('2026-02-01T10:00:00Z');
    const cust = await Customer.create({
      name: 'High Value Inactive',
      email: 'highvalue@example.com',
      phone: '9876543210',
      totalRevenue: 2000,
      completedOrders: 1,
      lastActivityAt: new Date('2026-01-01T10:00:00Z'), // 31 days inactive
      createdAt: new Date('2025-12-01T10:00:00Z')
    });

    const candidates = await intelligenceService.evaluateCustomerOpportunities(cust, {}, now);
    const primary = intelligenceService.selectPrimaryOpportunity(candidates);

    expect(primary).toBeDefined();
    expect(primary.opportunityType).toBe('high_value_reactivation');
    expect(primary.recommendedAction).toBe('vip_reactivation_offer');
  });

  test('3. Tie-break behavior respects PRECEDENCE_ORDER when scores match', async () => {
    const candidates = [
      { opportunityType: 'inactive_customer_followup', priorityScore: 60, isEligible: true },
      { opportunityType: 'first_completion_followup', priorityScore: 60, isEligible: true }
    ];

    const primary = intelligenceService.selectPrimaryOpportunity(candidates);
    expect(primary.opportunityType).toBe('first_completion_followup');
  });

  test('4. Abandoned request detection via explicit request_abandoned event', async () => {
    const now = new Date('2026-02-01T10:00:00Z');
    const cust = await Customer.create({
      name: 'Abandoned User',
      email: 'abandoned@example.com',
      phone: '9876543210',
      totalOrders: 1,
      completedOrders: 0,
      lastActivityAt: now,
      createdAt: now
    });

    await CustomerEvent.create({
      customerId: cust._id,
      eventType: 'request_abandoned',
      timestamp: now,
      sourceEventKey: 'ab_1'
    });

    const profile = await intelligenceService.getCustomerIntelligenceProfile(cust._id, now);
    expect(profile.availableIntelligenceSignals.hasAbandonedRequest).toBe(true);
    expect(profile.selectedPrimaryOpportunity.opportunityType).toBe('abandoned_request');
    expect(profile.primaryRecommendedAction).toBe('request_recovery_followup');
  });

  test('5. Never-completed detection with high-intent selling event', async () => {
    const now = new Date('2026-02-01T10:00:00Z');
    const cust = await Customer.create({
      name: 'Never Completed User',
      email: 'never@example.com',
      phone: '9876543210',
      totalOrders: 0,
      completedOrders: 0,
      lastActivityAt: now,
      createdAt: new Date('2025-11-01T10:00:00Z') // Account age > 30 days
    });

    await CustomerEvent.create({
      customerId: cust._id,
      eventType: 'quote_created',
      timestamp: now,
      sourceEventKey: 'nc_1'
    });

    const profile = await intelligenceService.getCustomerIntelligenceProfile(cust._id, now);
    expect(profile.availableIntelligenceSignals.hasHighIntentEvent).toBe(true);
    expect(profile.selectedPrimaryOpportunity.opportunityType).toBe('never_completed');
    expect(profile.primaryRecommendedAction).toBe('first_quote_encouragement');
  });

  test('6. Page visit alone does NOT trigger never_completed', async () => {
    const now = new Date('2026-02-01T10:00:00Z');
    const cust = await Customer.create({
      name: 'Visitor User',
      email: 'visitor@example.com',
      phone: '9876543210',
      totalOrders: 0,
      completedOrders: 0,
      lastActivityAt: now,
      createdAt: new Date('2025-11-01T10:00:00Z') // Account age > 30 days
    });

    await CustomerEvent.create({
      customerId: cust._id,
      eventType: 'page_visit',
      timestamp: now,
      sourceEventKey: 'pv_1'
    });

    const candidates = await intelligenceService.evaluateCustomerOpportunities(cust, { hasHighIntentEvent: false, hasAbandonedRequest: false }, now);
    const ncCandidate = candidates.find(c => c.opportunityType === 'never_completed');

    expect(ncCandidate.isEligible).toBe(false);
    expect(ncCandidate.exclusionReason).toContain('No meaningful selling/request intent events');
  });

  test('7. Request abandonment excludes never_completed', async () => {
    const now = new Date('2026-02-01T10:00:00Z');
    const cust = await Customer.create({
      name: 'Abandoned & Intent User',
      email: 'ab_intent@example.com',
      phone: '9876543210',
      totalOrders: 1,
      completedOrders: 0,
      lastActivityAt: now,
      createdAt: now
    });

    await CustomerEvent.create([
      { customerId: cust._id, eventType: 'quote_created', timestamp: now, sourceEventKey: 'abi_1' },
      { customerId: cust._id, eventType: 'request_abandoned', timestamp: now, sourceEventKey: 'abi_2' }
    ]);

    const candidates = await intelligenceService.evaluateCustomerOpportunities(cust, { hasHighIntentEvent: true, hasAbandonedRequest: true }, now);
    const ncCandidate = candidates.find(c => c.opportunityType === 'never_completed');
    const abCandidate = candidates.find(c => c.opportunityType === 'abandoned_request');

    expect(abCandidate.isEligible).toBe(true);
    expect(ncCandidate.isEligible).toBe(false);
    expect(ncCandidate.exclusionReason).toContain('Customer has explicit request_abandoned event');
  });

  test('8. Bounded 0-100 priority scoring', () => {
    const lowCustomer = { totalRevenue: 0, completedOrders: 0 };
    const highCustomer = { totalRevenue: 5000, completedOrders: 5 };

    const scoreLow = intelligenceService.calculatePriorityScore(30, lowCustomer, 200);
    const scoreHigh = intelligenceService.calculatePriorityScore(80, highCustomer, 5);

    expect(scoreLow).toBeGreaterThanOrEqual(0);
    expect(scoreLow).toBeLessThanOrEqual(100);
    expect(scoreHigh).toBeGreaterThanOrEqual(0);
    expect(scoreHigh).toBeLessThanOrEqual(100);
  });

  test('9. High revenue bonus (+10) applied', () => {
    const normalCust = { totalRevenue: 500, completedOrders: 1 };
    const highRevCust = { totalRevenue: 1500, completedOrders: 1 };

    const normalScore = intelligenceService.calculatePriorityScore(60, normalCust, 10);
    const highRevScore = intelligenceService.calculatePriorityScore(60, highRevCust, 10);

    expect(highRevScore - normalScore).toBe(10);
  });

  test('10. Repeat seller bonus (+5) applied', () => {
    const singleCust = { totalRevenue: 500, completedOrders: 1 };
    const repeatCust = { totalRevenue: 500, completedOrders: 2 };

    const singleScore = intelligenceService.calculatePriorityScore(60, singleCust, 10);
    const repeatScore = intelligenceService.calculatePriorityScore(60, repeatCust, 10);

    expect(repeatScore - singleScore).toBe(5);
  });

  test('11. >180-day inactivity penalty (-10) applied', () => {
    const cust = { totalRevenue: 500, completedOrders: 1 };

    const recentScore = intelligenceService.calculatePriorityScore(60, cust, 30);
    const dormantScore = intelligenceService.calculatePriorityScore(60, cust, 200);

    expect(recentScore - dormantScore).toBe(10);
  });

  test('12. Channel eligibility evaluated for email, sms, whatsapp', async () => {
    const cust = await Customer.create({
      name: 'Channel User',
      email: 'chan@example.com',
      phone: '9876543210'
    });

    const intel = await intelligenceService.evaluateChannelIntelligence(cust);
    expect(intel.eligibleChannels).toContain('email');
    expect(intel.eligibleChannels).toContain('sms');
    expect(intel.eligibleChannels).toContain('whatsapp');
  });

  test('13. Multiple eligible channels produce no unsupported ranking', async () => {
    const cust = await Customer.create({
      name: 'Multi Channel User',
      email: 'multi_chan@example.com',
      phone: '9876543210'
    });

    const intel = await intelligenceService.evaluateChannelIntelligence(cust);
    expect(intel.eligibleChannels.length).toBeGreaterThan(1);
    expect(intel.recommendedChannel).toBeNull();
    expect(intel.channelRecommendationSupported).toBe(false);
    expect(intel.reason).toContain('Multiple channels are eligible');
  });

  test('14. Push channel NEVER appears anywhere in recommendations or output', async () => {
    const cust = await Customer.create({
      name: 'Push Check User',
      email: 'push@example.com',
      phone: '9876543210',
      scrapmeUserId: 'usr_push_123'
    });

    const profile = await intelligenceService.getCustomerIntelligenceProfile(cust._id);
    const channelIntel = profile.channelIntelligence;

    expect(channelIntel.eligibleChannels).not.toContain('push');
    expect(channelIntel.recommendedChannel).not.toBe('push');
  });

  test('15. Contact timing remains unsupported', async () => {
    const cust = await Customer.create({
      name: 'Timing Check User',
      email: 'timing@example.com',
      phone: '9876543210'
    });

    const profile = await intelligenceService.getCustomerIntelligenceProfile(cust._id);
    expect(profile.timingIntelligence.timingRecommendationSupported).toBe(false);
    expect(profile.timingIntelligence.reason).toContain('Customer-specific optimal contact timing is not currently stored');
  });

  test('16. Unsubscribed customer suppression enforced', async () => {
    const cust = await Customer.create({
      name: 'Unsubscribed User',
      email: 'unsub@example.com',
      phone: '9876543210',
      unsubscribed: true,
      totalRevenue: 2000,
      lastActivityAt: new Date('2025-01-01')
    });

    await CommunicationPreference.create([
      { customerId: cust._id, channel: 'email', messageType: 'all', optedIn: false },
      { customerId: cust._id, channel: 'sms', messageType: 'all', optedIn: false },
      { customerId: cust._id, channel: 'whatsapp', messageType: 'all', optedIn: false }
    ]);

    const profile = await intelligenceService.getCustomerIntelligenceProfile(cust._id);
    expect(profile.suppressionState.isUnsubscribed).toBe(true);
    expect(profile.channelIntelligence.eligibleChannels).toHaveLength(0);
  });

  test('17. Missing contact data excludes corresponding channel', async () => {
    const custEmailOnly = await Customer.create({
      name: 'Email Only User',
      email: 'emailonly@example.com'
    });

    const intel = await intelligenceService.evaluateChannelIntelligence(custEmailOnly);
    expect(intel.eligibleChannels).toEqual(['email']);
    expect(intel.recommendedChannel).toBe('email');
    expect(intel.channelRecommendationSupported).toBe(true);
  });

  test('18. Explanation correctness', async () => {
    const now = new Date('2026-02-01T10:00:00Z');
    const cust = await Customer.create({
      name: 'Explanation User',
      email: 'explain@example.com',
      phone: '9876543210',
      totalRevenue: 1500,
      completedOrders: 1,
      lastActivityAt: new Date('2026-01-01T10:00:00Z')
    });

    const profile = await intelligenceService.getCustomerIntelligenceProfile(cust._id, now);
    expect(profile.explanation).toBeDefined();
    expect(profile.explanation).toContain('Customer generated Rs. 1500 in historical revenue');
  });

  test('19. Authentication rejects missing/invalid tokens with HTTP 401', async () => {
    const resNoToken = await request(app).get('/api/intelligence/summary');
    expect(resNoToken.status).toBe(401);
    expect(resNoToken.body.error).toBe('Integration authorization required');

    const resBadToken = await request(app)
      .get('/api/intelligence/summary')
      .set('x-integration-token', 'wrong_token');
    expect(resBadToken.status).toBe(401);
  });

  test('20. Invalid customer ID format returns HTTP 400', async () => {
    const res = await request(app)
      .get('/api/intelligence/customers/invalid_id_format')
      .set('x-integration-token', AUTH_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid customer ID format');
  });

  test('21. GET /api/intelligence/customers/:id returns full profile', async () => {
    const cust = await Customer.create({
      name: 'API Profile User',
      email: 'api_prof@example.com',
      phone: '9876543210',
      completedOrders: 1,
      lastActivityAt: new Date()
    });

    const res = await request(app)
      .get(`/api/intelligence/customers/${cust._id}`)
      .set('x-integration-token', AUTH_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customerIdentity.customerId).toBe(String(cust._id));
    expect(res.body.data.opportunityCandidates).toBeDefined();
  });

  test('22. GET /api/intelligence/opportunities returns paginated opportunities', async () => {
    await Customer.create({
      name: 'Opp User 1',
      email: 'opp1@example.com',
      phone: '9876543210',
      totalRevenue: 2000,
      lastActivityAt: new Date('2025-01-01')
    });

    const res = await request(app)
      .get('/api/intelligence/opportunities?page=1&limit=10')
      .set('x-integration-token', AUTH_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.opportunities).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
  });

  test('23. GET /api/intelligence/summary returns macro summary metrics', async () => {
    await Customer.create({
      name: 'Summary User 1',
      email: 'sum1@example.com',
      phone: '9876543210',
      totalRevenue: 2000,
      lastActivityAt: new Date('2025-01-01')
    });

    const res = await request(app)
      .get('/api/intelligence/summary')
      .set('x-integration-token', AUTH_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalCustomersAnalyzed).toBe(1);
    expect(res.body.data.priorityBreakdown).toBeDefined();
  });
});
