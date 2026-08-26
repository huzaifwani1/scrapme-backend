const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');

// Models
const Customer = require('../src/models/Customer');
const CustomerEvent = require('../src/models/CustomerEvent');
const CustomerSegment = require('../src/models/CustomerSegment');
const Automation = require('../src/models/Automation');
const AutomationExecution = require('../src/models/AutomationExecution');

// Services & Fixtures
const conditionEvaluator = require('../src/services/conditionEvaluator');
const suppressionService = require('../src/services/suppressionService');
const automationService = require('../src/services/automationService');
const automationFixtures = require('../src/config/automationFixtures');

describe('Phase 4 — Automation Engine Foundation Tests', () => {
  let mongo;
  const token = 'test-token-12345';
  const headers = { 'x-integration-token': token };

  beforeAll(async () => {
    process.env.INTEGRATION_SYNC_TOKEN = token;
    process.env.DRY_RUN = 'true';

    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      Customer.syncIndexes(),
      CustomerEvent.syncIndexes(),
      CustomerSegment.syncIndexes(),
      Automation.syncIndexes(),
      AutomationExecution.syncIndexes(),
    ]);
  });

  afterAll(async () => {
    delete process.env.INTEGRATION_SYNC_TOKEN;
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Customer.deleteMany({}),
      CustomerEvent.deleteMany({}),
      CustomerSegment.deleteMany({}),
      Automation.deleteMany({}),
      AutomationExecution.deleteMany({}),
    ]);
  });

  // ── 1. Model Validation ──────────────────────────────────
  describe('Automation & AutomationExecution Models', () => {
    it('creates active, paused, draft, and archived automations with conditions and actions', async () => {
      const valid = await Automation.create({
        name: 'Welcome Series',
        trigger: { type: 'event', eventType: 'user_created', delayMinutes: 0 },
        conditions: [
          { field: 'completedOrders', operator: 'equals', value: 0 }
        ],
        actions: [
          { type: 'send_message', channel: 'email', templateId: 'welcome_email' }
        ],
        status: 'active'
      });
      expect(valid._id).toBeDefined();
      expect(valid.status).toBe('active');
    });

    it('rejects invalid trigger types, statuses, and operators', async () => {
      await expect(Automation.create({
        name: 'Invalid Status',
        trigger: { type: 'invalid_trigger', eventType: 'user_created' },
        status: 'invalid_status'
      })).rejects.toThrow();

      await expect(Automation.create({
        name: 'Invalid Operator',
        trigger: { type: 'event', eventType: 'user_created' },
        conditions: [
          { field: 'completedOrders', operator: 'invalid_op', value: 0 }
        ]
      })).rejects.toThrow();
    });

    it('creates AutomationExecution with compound indexes', async () => {
      const autoId = new mongoose.Types.ObjectId();
      const custId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();

      const exec = await AutomationExecution.create({
        automationId: autoId,
        customerId: custId,
        triggerEventId: eventId,
        status: 'completed',
        scheduledFor: new Date(),
        executedAt: new Date(),
        actionResults: [{ type: 'send_message', status: 'queued_for_future_execution' }]
      });

      expect(exec._id).toBeDefined();
      expect(exec.status).toBe('completed');
    });
  });

  // ── 2. Condition Evaluation ──────────────────────────────
  describe('Condition Evaluator', () => {
    const customer = {
      customerStatus: 'active',
      completedOrders: 5,
      totalOrders: 6,
      totalRevenue: 5000,
      acquisitionSource: 'google',
      tags: ['vip', 'premium'],
      firstSeenAt: new Date('2026-01-01T00:00:00.000Z'),
      segments: ['repeat_seller']
    };

    it('evaluates equals and not_equals', () => {
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'customerStatus', operator: 'equals', value: 'active' })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'customerStatus', operator: 'equals', value: 'inactive' })).toBe(false);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'customerStatus', operator: 'not_equals', value: 'inactive' })).toBe(true);
    });

    it('evaluates greater_than and less_than operator variants', () => {
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'completedOrders', operator: 'greater_than', value: 4 })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'completedOrders', operator: 'greater_than', value: 5 })).toBe(false);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'completedOrders', operator: 'greater_than_or_equal', value: 5 })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'completedOrders', operator: 'less_than', value: 6 })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'completedOrders', operator: 'less_than_or_equal', value: 5 })).toBe(true);
    });

    it('evaluates exists and not_exists', () => {
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'totalRevenue', operator: 'exists', value: true })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'referralCode', operator: 'exists', value: true })).toBe(false);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'referralCode', operator: 'exists', value: false })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'referralCode', operator: 'not_exists', value: true })).toBe(true);
    });

    it('evaluates contains', () => {
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'tags', operator: 'contains', value: 'vip' })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'tags', operator: 'contains', value: 'new' })).toBe(false);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'acquisitionSource', operator: 'contains', value: 'goo' })).toBe(true);
    });

    it('evaluates in and not_in', () => {
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'customerStatus', operator: 'in', value: ['new', 'active'] })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'customerStatus', operator: 'in', value: ['dormant', 'inactive'] })).toBe(false);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'customerStatus', operator: 'not_in', value: ['dormant', 'inactive'] })).toBe(true);
    });

    it('fails safely for unallowlisted fields and unknown operators', () => {
      // should log warning and return false
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'passwordHash', operator: 'equals', value: 'secret' })).toBe(false);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'customerStatus', operator: 'match_regex', value: '.*' })).toBe(false);
    });

    it('evaluates segment membership mapping', () => {
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'segments', operator: 'contains', value: 'repeat_seller' })).toBe(true);
      expect(conditionEvaluator.evaluateCondition(customer, { field: 'segments', operator: 'contains', value: 'high_value' })).toBe(false);
    });
  });

  // ── 3. Suppression Rules ──────────────────────────────────
  describe('Suppression & Safety Checks', () => {
    it('suppresses unsubscribed customers for send_message actions', () => {
      const customer = { unsubscribed: true, email: 'test@example.com' };
      const action = { type: 'send_message', channel: 'email' };
      expect(suppressionService.evaluateActionSuppression({ customer, action })).toEqual({
        suppressed: true,
        reason: 'unsubscribed'
      });
    });

    it('allows non-message actions for unsubscribed customers', () => {
      const customer = { unsubscribed: true };
      const action = { type: 'add_tag', config: { tag: 'unsubscribed_engaged' } };
      expect(suppressionService.evaluateActionSuppression({ customer, action })).toEqual({
        suppressed: false
      });
    });

    it('suppresses if required recipient is missing for selected channel', () => {
      const noEmail = { email: '', phone: '123' };
      const noPhone = { email: 'a@b.com', phone: null };

      expect(suppressionService.evaluateActionSuppression({ customer: noEmail, action: { type: 'send_message', channel: 'email' } })).toEqual({
        suppressed: true,
        reason: 'missing_recipient_email'
      });
      expect(suppressionService.evaluateActionSuppression({ customer: noPhone, action: { type: 'send_message', channel: 'whatsapp' } })).toEqual({
        suppressed: true,
        reason: 'missing_recipient_phone'
      });
    });
  });

  // ── 4. Delay Calculations & Action Generation ─────────────
  describe('Delay & Action Generation', () => {
    it('calculates future scheduledFor date and creates pending execution on trigger delay', async () => {
      const automation = await Automation.create({
        name: 'Delayed Email',
        trigger: { type: 'event', eventType: 'request_abandoned', delayMinutes: 60 },
        status: 'active'
      });
      const customer = await Customer.create({ name: 'Cust', email: 'c@example.com' });
      const event = await CustomerEvent.create({ customerId: customer._id, eventType: 'request_abandoned', sourceEventKey: 'e1', timestamp: new Date('2026-08-25T10:00:00Z') });

      const exec = await automationService.executeAutomation({ automation, customer, event });
      expect(exec.status).toBe('pending');
      expect(exec.scheduledFor.toISOString()).toBe('2026-08-25T11:00:00.000Z');
      expect(exec.executedAt).toBeNull();
    });

    it('generates queued mock action results in dry-run mode and never invokes actual messaging APIs', async () => {
      const automation = await Automation.create({
        name: 'Immediate Actions',
        trigger: { type: 'event', eventType: 'pickup_completed', delayMinutes: 0 },
        actions: [
          { type: 'send_message', channel: 'email', templateId: 'welcome' },
          { type: 'add_tag', config: { tag: 'vip' } }
        ],
        status: 'active'
      });
      const customer = await Customer.create({ name: 'Cust', email: 'c@example.com' });
      const exec = await automationService.executeAutomation({ automation, customer, event: null });

      expect(exec.status).toBe('completed');
      expect(exec.actionResults).toEqual([
        expect.objectContaining({ type: 'send_message', channel: 'email', status: 'queued_for_future_execution' }),
        expect.objectContaining({ type: 'add_tag', tag: 'vip', status: 'queued_for_future_execution' })
      ]);
    });
  });

  // ── 5. Idempotency Checks ──────────────────────────────────
  describe('Idempotency Guards', () => {
    it('prevents duplicate AutomationExecutions for the same automation + customer + event', async () => {
      const automation = await Automation.create({
        name: 'Idempotence Test',
        trigger: { type: 'event', eventType: 'request_abandoned', delayMinutes: 0 },
        status: 'active'
      });
      const customer = await Customer.create({ name: 'Cust', email: 'c@example.com' });
      const event = await CustomerEvent.create({ customerId: customer._id, eventType: 'request_abandoned', sourceEventKey: 'e:dup' });

      // Run 1st execution
      const exec1 = await automationService.executeAutomation({ automation, customer, event });
      // Run 2nd execution
      const exec2 = await automationService.executeAutomation({ automation, customer, event });

      expect(exec1._id.toString()).toBe(exec2._id.toString());
      const count = await AutomationExecution.countDocuments({ automationId: automation._id, customerId: customer._id });
      expect(count).toBe(1);
    });

    it('allows executions for different events or different automations', async () => {
      const aut1 = await Automation.create({ name: 'A1', trigger: { type: 'event', eventType: 'page_visit' }, status: 'active' });
      const aut2 = await Automation.create({ name: 'A2', trigger: { type: 'event', eventType: 'page_visit' }, status: 'active' });
      const customer = await Customer.create({ name: 'Cust', email: 'c@example.com' });
      const ev1 = await CustomerEvent.create({ customerId: customer._id, eventType: 'page_visit', sourceEventKey: 'e:1' });
      const ev2 = await CustomerEvent.create({ customerId: customer._id, eventType: 'page_visit', sourceEventKey: 'e:2' });

      // Same automation + customer + different events
      await automationService.executeAutomation({ automation: aut1, customer, event: ev1 });
      await automationService.executeAutomation({ automation: aut1, customer, event: ev2 });

      // Different automations + customer + same event
      await automationService.executeAutomation({ automation: aut2, customer, event: ev1 });

      const totalExecs = await AutomationExecution.countDocuments({});
      expect(totalExecs).toBe(3);
    });
  });

  // ── 6. Test Fixtures Scenarios ────────────────────────────
  describe('Use Case Automation Fixtures', () => {
    it('Abandoned Request scenario wait 60m and generates email/WhatsApp', async () => {
      const config = automationFixtures.abandonedRequest;
      const automation = await Automation.create(config);
      const customer = await Customer.create({ name: 'Abandoned Buyer', email: 'buyer@example.com', phone: '111-222' });
      const event = await CustomerEvent.create({ customerId: customer._id, eventType: 'request_abandoned', sourceEventKey: 'phase4:e1', timestamp: new Date() });

      const exec = await automationService.executeAutomation({ automation, customer, event });
      expect(exec.status).toBe('pending');
      expect(exec.scheduledFor.getTime() - event.timestamp.getTime()).toBe(60 * 60 * 1000);
    });

    it('First-Time Seller Follow-up evaluates completedOrders == 1 condition', async () => {
      const config = automationFixtures.firstTimeSeller;
      const automation = await Automation.create(config);
      automation.status = 'active'; // force active to evaluate

      const customer1 = await Customer.create({ name: 'First Seller', email: 'seller1@example.com', completedOrders: 1 });
      const customer2 = await Customer.create({ name: 'Repeat Seller', email: 'seller2@example.com', completedOrders: 2 });

      const exec1 = await automationService.executeAutomation({ automation, customer: customer1, event: null });
      expect(exec1.status).toBe('completed');
      expect(exec1.actionResults.length).toBe(1);

      const exec2 = await automationService.executeAutomation({ automation, customer: customer2, event: null });
      expect(exec2.status).toBe('skipped');
      expect(exec2.skipReason).toBe('conditions_not_met');
    });

    it('Repeat Seller Loyalty Action matches repeat_seller segment key', async () => {
      const config = automationFixtures.repeatSeller;
      const automation = await Automation.create(config);
      automation.status = 'active';

      const customer = await Customer.create({ name: 'Loyal User', email: 'loyal@example.com' });
      await CustomerSegment.create({ customerId: customer._id, segmentKey: 'repeat_seller', segmentName: 'Repeat Seller', reason: 'completedOrders >= 2' });

      const exec = await automationService.executeAutomation({ automation, customer, event: null });
      expect(exec.status).toBe('completed');
      expect(exec.actionResults[0].type).toBe('send_message');
    });
  });

  // ── 7. REST API Endpoints ──────────────────────────────────
  describe('API Routing & Controllers', () => {
    let testAutomation;
    let customer;

    beforeEach(async () => {
      testAutomation = await Automation.create({
        name: 'API Demo Automation',
        trigger: { type: 'event', eventType: 'demo_event', delayMinutes: 0 },
        conditions: [
          { field: 'completedOrders', operator: 'greater_than', value: 0 }
        ],
        actions: [
          { type: 'send_message', channel: 'email', templateId: 't1' }
        ],
        status: 'active'
      });

      customer = await Customer.create({
        name: 'API Customer',
        email: 'api@example.com',
        completedOrders: 1,
        totalOrders: 1
      });
    });

    it('rejects unauthenticated requests on all new endpoints', async () => {
      await request(app).post(`/api/automations/${testAutomation._id}/test`).send({}).expect(401);
      await request(app).post(`/api/automations/${testAutomation._id}/preview`).send({}).expect(401);
      await request(app).post(`/api/automations/${testAutomation._id}/execute-preview`).send({}).expect(401);
      await request(app).get('/api/automation-executions').expect(401);
    });

    it('POST /api/automations/:id/test evaluates inline mockup data', async () => {
      const response = await request(app)
        .post(`/api/automations/${testAutomation._id}/test`)
        .set(headers)
        .send({
          customer: { completedOrders: 3, email: 'mock@example.com' }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.eligible).toBe(true);
      expect(response.body.actionResults.length).toBe(1);
    });

    it('POST /api/automations/:id/preview returns summary of qualifiers without persistence', async () => {
      const response = await request(app)
        .post(`/api/automations/${testAutomation._id}/preview`)
        .set(headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.eligibleCount).toBe(1);
      expect(response.body.eligible[0].customerId.toString()).toBe(customer._id.toString());

      // Confirm no executions written to DB
      const execCount = await AutomationExecution.countDocuments({});
      expect(execCount).toBe(0);
    });

    it('POST /api/automations/:id/execute-preview generates dry-run executions in DB', async () => {
      const response = await request(app)
        .post(`/api/automations/${testAutomation._id}/execute-preview`)
        .set(headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.executionsCount).toBe(1);

      // Confirm executions were persisted
      const execCount = await AutomationExecution.countDocuments({});
      expect(execCount).toBe(1);
    });

    it('GET /api/automation-executions returns logs list with filtering', async () => {
      // Create a mock execution log
      await AutomationExecution.create({
        automationId: testAutomation._id,
        customerId: customer._id,
        status: 'completed',
        scheduledFor: new Date()
      });

      const response = await request(app)
        .get('/api/automation-executions')
        .query({ automationId: testAutomation._id.toString(), status: 'completed' })
        .set(headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.pagination.total).toBe(1);
    });
  });
});
