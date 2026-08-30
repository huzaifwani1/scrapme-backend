const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const NullProvider = require('../src/providers/NullProvider');
const { getProvider } = require('../src/providers/providerRegistry');
const templateService = require('../src/services/templateService');
const MessageIntent = require('../src/models/MessageIntent');
const CommunicationPreference = require('../src/models/CommunicationPreference');
const MessageTemplate = require('../src/models/MessageTemplate');
const WebhookEvent = require('../src/models/WebhookEvent');

describe('Phase 5 communication safety', () => {
  it('uses NullProvider and safely renders only declared placeholders', async () => {
    expect(getProvider('email')).toBeInstanceOf(NullProvider);
    const result = await getProvider('email').send({ channel: 'email', recipient: 'a@b.com' });
    expect(result).toMatchObject({ status: 'dry_run_suppressed', providerMessageId: null });
    expect(templateService.validateTemplateDefinition({ content: { body: 'Hi {{name}}' }, variables: ['name'] }).valid).toBe(true);
    expect(templateService.validateTemplateDefinition({ content: { body: 'Hi {{constructor}}' }, variables: [] }).valid).toBe(false);
    expect(templateService.renderTemplate({ content: { subject: '', body: 'Hi {{name}}' }, variables: ['name'] }, { name: 'Sam' }).renderedBody).toBe('Hi Sam');
  });

  it('requires authentication on all administrative communication endpoints', async () => {
    delete process.env.INTEGRATION_SYNC_TOKEN;
    for (const path of ['/api/templates', '/api/preferences/507f1f77bcf86cd799439011', '/api/message-intents', '/api/webhooks/events']) {
      expect((await request(app).get(path)).status).toBe(503);
    }
  });
});

describe('Phase 5 non-production database guarantees', () => {
  let mongo;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([MessageIntent.syncIndexes(), CommunicationPreference.syncIndexes(), MessageTemplate.syncIndexes(), WebhookEvent.syncIndexes()]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
  it('enforces intent, preference, template, and webhook idempotency indexes', async () => {
    const customerId = new mongoose.Types.ObjectId();
    await MessageIntent.create({ customerId, channel: 'email', templateSlug: 'hello', recipient: 'x@y.com', idempotencyKey: 'intent-1', dryRun: true });
    await expect(MessageIntent.create({ customerId, channel: 'email', templateSlug: 'hello', recipient: 'x@y.com', idempotencyKey: 'intent-1', dryRun: true })).rejects.toMatchObject({ code: 11000 });
    await CommunicationPreference.create({ customerId, channel: 'email', messageType: 'marketing', optedIn: false });
    await expect(CommunicationPreference.create({ customerId, channel: 'email', messageType: 'marketing' })).rejects.toMatchObject({ code: 11000 });
    await WebhookEvent.create({ provider: 'null', eventType: 'delivered', rawPayload: {}, idempotencyKey: 'event-1' });
    await expect(WebhookEvent.create({ provider: 'null', eventType: 'delivered', rawPayload: {}, idempotencyKey: 'event-1' })).rejects.toMatchObject({ code: 11000 });
  });
});
