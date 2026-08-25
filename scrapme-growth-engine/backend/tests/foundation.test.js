const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');

// ── Models ───────────────────────────────────────────────────
const Customer = require('../src/models/Customer');
const CustomerEvent = require('../src/models/CustomerEvent');
const Campaign = require('../src/models/Campaign');
const Automation = require('../src/models/Automation');
const MessageLog = require('../src/models/MessageLog');

// ══════════════════════════════════════════════════════════════
// Phase 1 Foundation Tests
//
// These tests validate the backend foundation WITHOUT requiring
// a real MongoDB connection. Models are verified via schema
// inspection. API tests use supertest against the Express app.
//
// Database-dependent integration tests should be added in Phase 2
// once a test database is configured.
// ══════════════════════════════════════════════════════════════

describe('Phase 1 — Foundation Tests', () => {

  // ── 1. Health Endpoint ───────────────────────────────────
  describe('GET /api/health', () => {
    it('returns 200 with service info', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.service).toBe('scrapme-growth-engine');
      expect(res.body.version).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ── 2. 404 Handler ──────────────────────────────────────
  describe('Unknown routes', () => {
    it('returns 404 for non-existent routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Route not found');
    });
  });

  // ── 3. Database Config ──────────────────────────────────
  describe('Database configuration', () => {
    it('database module exports connectDatabase and disconnectDatabase', () => {
      const db = require('../src/config/database');
      expect(typeof db.connectDatabase).toBe('function');
      expect(typeof db.disconnectDatabase).toBe('function');
    });
  });

  // ── 4. Customer Model ───────────────────────────────────
  describe('Customer model', () => {
    it('can be initialized and has expected schema paths', () => {
      expect(Customer).toBeDefined();
      expect(Customer.modelName).toBe('Customer');

      const paths = Object.keys(Customer.schema.paths);
      const required = [
        'name', 'email', 'phone',
        'acquisitionSource', 'acquisitionMedium', 'acquisitionCampaign',
        'influencerId', 'referralCode',
        'firstSeenAt', 'lastActivityAt',
        'totalOrders', 'completedOrders', 'totalRevenue',
        'customerStatus', 'tags',
        'scrapmeUserId',
      ];
      required.forEach((field) => {
        expect(paths).toContain(field);
      });
    });

    it('exposes CUSTOMER_STATUSES', () => {
      expect(Array.isArray(Customer.CUSTOMER_STATUSES)).toBe(true);
      expect(Customer.CUSTOMER_STATUSES).toContain('active');
      expect(Customer.CUSTOMER_STATUSES).toContain('churned');
    });
  });

  // ── 5. CustomerEvent Model ──────────────────────────────
  describe('CustomerEvent model', () => {
    it('can be initialized and has expected schema paths', () => {
      expect(CustomerEvent).toBeDefined();
      expect(CustomerEvent.modelName).toBe('CustomerEvent');

      const paths = Object.keys(CustomerEvent.schema.paths);
      ['customerId', 'eventType', 'source', 'metadata', 'timestamp',
       'scrapmeRequestId', 'scrapmePickupOrderId'].forEach((field) => {
        expect(paths).toContain(field);
      });
    });

    it('exposes EVENT_TYPES with all required types', () => {
      const types = CustomerEvent.EVENT_TYPES;
      expect(Array.isArray(types)).toBe(true);
      [
        'page_visit', 'quote_created', 'request_started',
        'request_submitted', 'request_abandoned', 'pickup_assigned',
        'pickup_completed', 'payment_completed', 'review_submitted',
        'referral_click',
      ].forEach((t) => {
        expect(types).toContain(t);
      });
    });
  });

  // ── 6. Campaign Model ──────────────────────────────────
  describe('Campaign model', () => {
    it('can be initialized and has expected schema paths', () => {
      expect(Campaign).toBeDefined();
      expect(Campaign.modelName).toBe('Campaign');

      const paths = Object.keys(Campaign.schema.paths);
      ['name', 'type', 'channel', 'status', 'audience',
       'scheduledAt', 'startedAt', 'completedAt'].forEach((field) => {
        expect(paths).toContain(field);
      });
    });

    it('exposes CAMPAIGN_TYPES and CAMPAIGN_CHANNELS', () => {
      expect(Campaign.CAMPAIGN_TYPES).toContain('drip');
      expect(Campaign.CAMPAIGN_CHANNELS).toContain('email');
      expect(Campaign.CAMPAIGN_CHANNELS).toContain('whatsapp');
    });
  });

  // ── 7. Automation Model ─────────────────────────────────
  describe('Automation model', () => {
    it('can be initialized and has expected schema paths', () => {
      expect(Automation).toBeDefined();
      expect(Automation.modelName).toBe('Automation');

      const paths = Object.keys(Automation.schema.paths);
      ['name', 'description', 'status'].forEach((field) => {
        expect(paths).toContain(field);
      });
    });

    it('exposes AUTOMATION_STATUSES', () => {
      expect(Automation.AUTOMATION_STATUSES).toContain('active');
      expect(Automation.AUTOMATION_STATUSES).toContain('draft');
    });
  });

  // ── 8. MessageLog Model ─────────────────────────────────
  describe('MessageLog model', () => {
    it('can be initialized and has expected schema paths', () => {
      expect(MessageLog).toBeDefined();
      expect(MessageLog.modelName).toBe('MessageLog');

      const paths = Object.keys(MessageLog.schema.paths);
      ['customerId', 'campaignId', 'automationId', 'channel',
       'recipient', 'messageType', 'status', 'providerMessageId',
       'sentAt', 'deliveredAt', 'openedAt', 'clickedAt'].forEach((field) => {
        expect(paths).toContain(field);
      });
    });

    it('exposes MESSAGE_STATUSES and MESSAGE_CHANNELS', () => {
      expect(MessageLog.MESSAGE_STATUSES).toContain('delivered');
      expect(MessageLog.MESSAGE_CHANNELS).toContain('whatsapp');
    });
  });

  // ── 9. API Route Registration ───────────────────────────
  describe('API route registration', () => {
    it('all expected API route prefixes are mounted on the Express app', () => {
      // Extract the full router stack and check each expected prefix matches
      const stack = app._router.stack;

      const expectedPrefixes = [
        '/api/health',
        '/api/customers',
        '/api/events',
        '/api/campaigns',
        '/api/automations',
        '/api/message-logs',
      ];

      expectedPrefixes.forEach((prefix) => {
        const found = stack.some((layer) => {
          // Router-mounted layers have a regexp that matches the mount path
          if (layer.regexp) {
            return layer.regexp.test(prefix);
          }
          return false;
        });
        expect(found).toBe(true);
      });
    });
  });

  // ── Cleanup ─────────────────────────────────────────────
  afterAll(async () => {
    // Close any mongoose connections opened during testing
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
});
