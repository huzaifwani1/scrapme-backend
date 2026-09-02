const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../src/app');
const Customer = require('../src/models/Customer');
const CustomerEvent = require('../src/models/CustomerEvent');
const Campaign = require('../src/models/Campaign');
const CampaignExecution = require('../src/models/CampaignExecution');
const MessageIntent = require('../src/models/MessageIntent');
const MessageLog = require('../src/models/MessageLog');
const analyticsService = require('../src/services/analyticsService');

let mongoServer;
const AUTH_TOKEN = 'test_integration_token_analytics';

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
  await Campaign.deleteMany({});
  await CampaignExecution.deleteMany({});
  await MessageIntent.deleteMany({});
  await MessageLog.deleteMany({});
});

describe('Phase 7A Analytics Foundation — Audit Fix Regression Tests', () => {

  async function seedTestData() {
    const cust1 = await Customer.create({
      name: 'Google User 1',
      email: 'g1@example.com',
      acquisitionSource: 'google',
      completedOrders: 1,
      totalRevenue: 700,
      customerStatus: 'active',
      createdAt: new Date('2026-01-10T10:00:00Z')
    });

    const cust2 = await Customer.create({
      name: 'Google User 2 (Repeat)',
      email: 'g2@example.com',
      acquisitionSource: 'google',
      completedOrders: 2,
      totalRevenue: 1500,
      customerStatus: 'engaged',
      createdAt: new Date('2026-01-12T10:00:00Z')
    });

    const cust3 = await Customer.create({
      name: 'Insta User 1',
      email: 'insta1@example.com',
      acquisitionSource: 'instagram',
      completedOrders: 0,
      totalRevenue: 0,
      customerStatus: 'new',
      createdAt: new Date('2026-01-15T10:00:00Z')
    });

    const cust4 = await Customer.create({
      name: 'Influencer User 1',
      email: 'inf1@example.com',
      acquisitionSource: 'influencer',
      influencerId: 'inf_123',
      referralCode: 'INF123',
      completedOrders: 1,
      totalRevenue: 1200,
      customerStatus: 'active',
      createdAt: new Date('2026-01-20T10:00:00Z')
    });

    const cust5 = await Customer.create({
      name: 'Direct User 1',
      email: 'direct1@example.com',
      acquisitionSource: 'direct',
      completedOrders: 0,
      totalRevenue: 0,
      customerStatus: 'inactive',
      lastActivityAt: new Date('2026-01-01T10:00:00Z'),
      createdAt: new Date('2026-01-01T10:00:00Z')
    });

    const cust6 = await Customer.create({
      name: 'Referral User 1',
      email: 'ref1@example.com',
      acquisitionSource: 'referral',
      referralCode: 'REF99',
      completedOrders: 1,
      totalRevenue: 500,
      customerStatus: 'active',
      createdAt: new Date('2026-01-22T10:00:00Z')
    });

    // Seed Events with unique sourceEventKeys
    await CustomerEvent.create([
      { customerId: cust1._id, eventType: 'request_submitted', timestamp: new Date('2026-01-10T11:00:00Z'), sourceEventKey: 'evt_1' },
      { customerId: cust1._id, eventType: 'pickup_assigned', timestamp: new Date('2026-01-10T12:00:00Z'), sourceEventKey: 'evt_2' },
      { customerId: cust1._id, eventType: 'pickup_completed', timestamp: new Date('2026-01-11T10:00:00Z'), sourceEventKey: 'evt_3' },

      { customerId: cust2._id, eventType: 'request_submitted', timestamp: new Date('2026-01-12T11:00:00Z'), sourceEventKey: 'evt_4' },
      { customerId: cust2._id, eventType: 'pickup_assigned', timestamp: new Date('2026-01-12T12:00:00Z'), sourceEventKey: 'evt_5' },
      { customerId: cust2._id, eventType: 'pickup_completed', timestamp: new Date('2026-01-13T10:00:00Z'), sourceEventKey: 'evt_6' },
      { customerId: cust2._id, eventType: 'payment_completed', timestamp: new Date('2026-01-25T10:00:00Z'), sourceEventKey: 'evt_7' },

      { customerId: cust3._id, eventType: 'request_submitted', timestamp: new Date('2026-01-15T11:00:00Z'), sourceEventKey: 'evt_8' },

      { customerId: cust4._id, eventType: 'request_submitted', timestamp: new Date('2026-01-20T11:00:00Z'), sourceEventKey: 'evt_9' },
      { customerId: cust4._id, eventType: 'pickup_assigned', timestamp: new Date('2026-01-20T12:00:00Z'), sourceEventKey: 'evt_10' },
      { customerId: cust4._id, eventType: 'payment_completed', timestamp: new Date('2026-01-21T10:00:00Z'), sourceEventKey: 'evt_11' },

      { customerId: cust6._id, eventType: 'request_submitted', timestamp: new Date('2026-01-22T11:00:00Z'), sourceEventKey: 'evt_12' },
      { customerId: cust6._id, eventType: 'payment_completed', timestamp: new Date('2026-01-23T10:00:00Z'), sourceEventKey: 'evt_13' }
    ]);

    // Seed Campaign
    const campaign = await Campaign.create({
      name: 'Winback Inactive Campaign',
      type: 'one_time',
      channel: 'email',
      status: 'completed',
      audience: { customerStatus: ['inactive'] }
    });

    await CampaignExecution.create([
      { campaignId: campaign._id, customerId: cust5._id, executionKey: 'exec_cust5', status: 'simulated', dryRun: true },
      { campaignId: campaign._id, customerId: cust1._id, executionKey: 'exec_cust1', status: 'suppressed', dryRun: true, suppressionReason: 'frequency_cap' }
    ]);

    await MessageIntent.create({
      campaignId: campaign._id,
      customerId: cust5._id,
      channel: 'email',
      templateSlug: 'winback_email_template',
      status: 'pending',
      recipient: cust5.email,
      dryRun: true
    });

    return { cust1, cust2, cust3, cust4, cust5, cust6, campaign };
  }

  describe('Acquisition Analytics Capability & First-Touch Support', () => {
    test('explicitly reports first-touch supported and latest-touch unsupported', async () => {
      await seedTestData();
      const res = await analyticsService.getAcquisitionAnalytics({});

      expect(res.attribution).toBeDefined();
      expect(res.attribution.firstTouch.supported).toBe(true);
      expect(res.attribution.latestTouch.supported).toBe(false);
      expect(res.attribution.latestTouch.reason).toContain('Latest-touch attribution is not stored in the Customer schema');
    });

    test('Google first-touch attribution works', async () => {
      await seedTestData();
      const res = await analyticsService.getAcquisitionAnalytics({});
      const google = res.channels.find(c => c.source === 'google');
      expect(google.customersAcquired).toBe(2);
      expect(google.requestsGenerated).toBe(2);
      expect(google.revenueGenerated).toBe(2200);
    });

    test('Instagram first-touch attribution works', async () => {
      await seedTestData();
      const res = await analyticsService.getAcquisitionAnalytics({});
      const insta = res.channels.find(c => c.source === 'instagram');
      expect(insta.customersAcquired).toBe(1);
      expect(insta.requestsGenerated).toBe(1);
    });

    test('Influencer first-touch attribution works', async () => {
      await seedTestData();
      const res = await analyticsService.getAcquisitionAnalytics({});
      const influencer = res.channels.find(c => c.source === 'influencer');
      expect(influencer.customersAcquired).toBe(1);
      expect(influencer.revenueGenerated).toBe(1200);
    });

    test('Direct and referral attribution works', async () => {
      await seedTestData();
      const res = await analyticsService.getAcquisitionAnalytics({});
      const direct = res.channels.find(c => c.source === 'direct');
      const referral = res.channels.find(c => c.source === 'referral');

      expect(direct.customersAcquired).toBe(1);
      expect(referral.customersAcquired).toBe(1);
      expect(referral.revenueGenerated).toBe(500);
    });
  });

  describe('Campaign Analytics & Outcome Attribution Fix', () => {
    test('proves a targeted customer who submits a request does NOT cause attributedRequests > 0', async () => {
      const { campaign } = await seedTestData();
      const res = await analyticsService.getCampaignAnalytics({ campaignId: campaign._id });
      const camp = res.campaigns[0];

      expect(camp.outcomes.attributedRequests).toBeNull();
      expect(camp.outcomes.attributionSupported).toBe(false);
    });

    test('proves a targeted customer who completes a pickup does NOT cause attributedCompletedPickups > 0', async () => {
      const { campaign } = await seedTestData();
      const res = await analyticsService.getCampaignAnalytics({ campaignId: campaign._id });
      const camp = res.campaigns[0];

      expect(camp.outcomes.attributedCompletedPickups).toBeNull();
      expect(camp.outcomes.attributionSupported).toBe(false);
    });

    test('proves revenue generated later by a targeted customer does NOT become campaign-attributed revenue', async () => {
      const { campaign } = await seedTestData();
      const res = await analyticsService.getCampaignAnalytics({ campaignId: campaign._id });
      const camp = res.campaigns[0];

      expect(camp.outcomes.attributedRevenue).toBeNull();
      expect(camp.outcomes.attributionSupported).toBe(false);
    });

    test('reports attributionSupported: false in campaign outcomes', async () => {
      const { campaign } = await seedTestData();
      const res = await analyticsService.getCampaignAnalytics({ campaignId: campaign._id });
      const camp = res.campaigns[0];

      expect(camp.outcomes.attributionSupported).toBe(false);
      expect(camp.outcomes.reason).toBe('Explicit campaign-to-customer-event linkage is not available');
    });

    test('returns null for unsupported numeric campaign outcome metrics', async () => {
      const { campaign } = await seedTestData();
      const res = await analyticsService.getCampaignAnalytics({ campaignId: campaign._id });
      const camp = res.campaigns[0];

      expect(camp.outcomes.attributedRequests).toBeNull();
      expect(camp.outcomes.attributedCompletedPickups).toBeNull();
      expect(camp.outcomes.attributedRevenue).toBeNull();
    });

    test('preserves legitimate campaign execution/audience/message operational metrics', async () => {
      const { campaign } = await seedTestData();
      const res = await analyticsService.getCampaignAnalytics({ campaignId: campaign._id });
      const camp = res.campaigns[0];

      expect(camp.campaignAudience).toBe(2);
      expect(camp.eligibleAudience).toBe(1);
      expect(camp.executionCount).toBe(2);
      expect(camp.suppressedCount).toBe(1);
      expect(camp.simulatedMessageIntents).toBe(1);
    });
  });

  describe('Funnel & Revenue Analytics Base Tests', () => {
    test('returns visitor stage as unavailable and calculates conversion/drop-off correctly', async () => {
      await seedTestData();
      const res = await analyticsService.getFunnelAnalytics({});

      const visitorStage = res.funnel.find(s => s.stage === 'Visitor');
      expect(visitorStage.unavailable).toBe(true);
      expect(visitorStage.count).toBeNull();

      const signupStage = res.funnel.find(s => s.stage === 'Signup');
      expect(signupStage.count).toBe(6);

      const requestStage = res.funnel.find(s => s.stage === 'Request');
      expect(requestStage.count).toBe(5);
    });

    test('handles zero denominator without errors in funnel', async () => {
      const res = await analyticsService.getFunnelAnalytics({});
      const requestStage = res.funnel.find(s => s.stage === 'Request');
      expect(requestStage.conversionRatePercent).toBe(0);
      expect(requestStage.dropOffPercent).toBe(0);
    });

    test('calculates total revenue, ARPU, and handles ROI as unavailable', async () => {
      await seedTestData();
      const res = await analyticsService.getRevenueAnalytics({});

      expect(res.totalRevenue).toBe(3900); // 700 + 1500 + 1200 + 500
      expect(res.roi.costDataAvailable).toBe(false);
      expect(res.roi.value).toBe('cost data unavailable');
    });
  });

  describe('API Security & Validation Tests', () => {
    test('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/analytics/overview');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Integration authorization required');
    });

    test('returns 200 and data for authenticated overview endpoint', async () => {
      await seedTestData();
      const res = await request(app)
        .get('/api/analytics/overview')
        .set('x-integration-token', AUTH_TOKEN);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics.totalCustomers).toBe(6);
    });

    test('handles date range error in API endpoints with HTTP 400', async () => {
      const res = await request(app)
        .get('/api/analytics/overview?startDate=2026-02-01&endDate=2026-01-01')
        .set('x-integration-token', AUTH_TOKEN);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('startDate cannot be after endDate');
    });
  });
});
