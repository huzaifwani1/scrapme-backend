const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Customer = require('../src/models/Customer');
const CustomerEvent = require('../src/models/CustomerEvent');
const app = require('../src/app');
const errorHandler = require('../src/middleware/errorHandler');
const { getScrapmeSourceModels } = require('../src/services/scrapmeSourceModels');
const { applyReadOnlyGuards } = require('../src/config/scrapmeDatabase');

describe('Phase 2 safety integration', () => {
  const previousToken = process.env.INTEGRATION_SYNC_TOKEN;
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.INTEGRATION_SYNC_TOKEN = previousToken;
    process.env.NODE_ENV = previousEnv;
  });

  it('never permits an unauthenticated sync endpoint in development or production', async () => {
    delete process.env.INTEGRATION_SYNC_TOKEN;
    process.env.NODE_ENV = 'development';
    expect((await request(app).post('/api/integrations/scrapme/sync').send({ scope: 'all' })).status).toBe(503);
    process.env.NODE_ENV = 'production';
    expect((await request(app).post('/api/integrations/scrapme/sync').send({ scope: 'all' })).status).toBe(503);

    process.env.INTEGRATION_SYNC_TOKEN = 'local-test-token';
    expect((await request(app).post('/api/integrations/scrapme/sync').send({ scope: 'all' })).status).toBe(401);
  });

  it('exposes source models through a frozen read-only façade', async () => {
    const rawModels = {};
    const fakeConnection = {
      models: rawModels,
      model(name) {
        const model = { find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })), create: jest.fn(), save: jest.fn() };
        rawModels[name] = model;
        return model;
      },
    };
    const source = getScrapmeSourceModels(fakeConnection);
    expect(Object.isFrozen(source)).toBe(true);
    expect(source.User.create).toBeUndefined();
    expect(source.User.save).toBeUndefined();
    await source.User.find({});
    expect(rawModels.User.find).toHaveBeenCalledWith({});
  });

  it('sanitizes unhandled error logging', async () => {
    const isolated = express();
    isolated.get('/fail', (_req, _res, next) => next(Object.assign(new Error('mongodb://user:password@host/db token=abc'), { code: 'E_TEST' })));
    isolated.use(errorHandler);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await request(isolated).get('/fail');
    const logged = spy.mock.calls[0][1];
    expect(logged).toMatchObject({ name: 'Error', code: 'E_TEST', method: 'GET', path: '/fail' });
    expect(logged.message).not.toContain('password');
    expect(logged.message).not.toContain('token=abc');
    spy.mockRestore();
  });
});

describe('Non-production MongoDB index verification', () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Customer.syncIndexes();
    await CustomerEvent.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('creates required unique indexes and rejects duplicate source identities/events', async () => {
    const customerIndexes = await Customer.collection.indexes();
    const eventIndexes = await CustomerEvent.collection.indexes();
    expect(customerIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { scrapmeUserId: 1 }, unique: true }),
      expect.objectContaining({ key: { email: 1 }, unique: true }),
      expect.objectContaining({ key: { phone: 1 }, unique: true }),
    ]));
    expect(eventIndexes).toEqual(expect.arrayContaining([expect.objectContaining({ key: { sourceEventKey: 1 }, unique: true })]));

    const customer = await Customer.create({ scrapmeUserId: 'source-u1', email: 'unique@example.com', phone: '999' });
    await expect(Customer.create({ scrapmeUserId: 'source-u1' })).rejects.toMatchObject({ code: 11000 });
    await CustomerEvent.create({ customerId: customer._id, eventType: 'request_submitted', sourceEventKey: 'request:r1:request_submitted' });
    await expect(CustomerEvent.create({ customerId: customer._id, eventType: 'request_submitted', sourceEventKey: 'request:r1:request_submitted' })).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects accidental Mongoose writes on the source connection', async () => {
    const sourceConnection = mongoose.createConnection(mongo.getUri());
    applyReadOnlyGuards(sourceConnection);
    await sourceConnection.asPromise();
    const SourceUser = sourceConnection.model('SourceUser', new mongoose.Schema({ name: String }));
    await expect(SourceUser.create({ name: 'must-not-write' })).rejects.toMatchObject({ code: 'SOURCE_READ_ONLY' });
    await sourceConnection.close();
  });
});
