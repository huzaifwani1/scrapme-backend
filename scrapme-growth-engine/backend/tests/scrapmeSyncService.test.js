const { syncScrapmeData, sourceEventsForPickup, isValidRevenue } = require('../src/services/scrapmeSyncService');

function memoryRepository(initialCustomers = []) {
  const customers = initialCustomers.map((customer) => ({ ...customer }));
  const events = [];
  return {
    customers,
    events,
    async findCustomer({ scrapmeUserId, email, phone }) {
      return customers.find((customer) =>
        (scrapmeUserId && customer.scrapmeUserId === scrapmeUserId) ||
        (email && customer.email === email) ||
        (phone && customer.phone === phone)
      ) || null;
    },
    async saveCustomer(existing, changes, isNew) {
      const saved = existing ? Object.assign(existing, changes) : { _id: `c${customers.length + 1}`, ...changes };
      if (isNew) customers.push(saved);
      return saved;
    },
    async hasEvent(key) { return events.some((event) => event.sourceEventKey === key); },
    async createEvent(event) { events.push(event); return event; },
  };
}

const sourceData = {
  users: [{ _id: 'u1', name: 'Asha', email: ' Asha@Example.com ', phone: '+91 98765 43210', createdAt: '2026-01-01', updatedAt: '2026-01-02' }],
  requests: [{ _id: 'r1', userId: 'u1', status: 'purchased', referralCode: 'MAYA10', createdAt: '2026-01-03', updatedAt: '2026-01-03' }],
  pickupOrders: [{ _id: 'p1', orderId: 'PK-1', requestId: 'r1', status: 'completed', finalPrice: 500, startedAt: '2026-01-04', pickedUpAt: '2026-01-05', completedAt: '2026-01-06', updatedAt: '2026-01-06' }],
};

describe('ScrapMe data synchronisation', () => {
  it('maps a user, transactions, attribution, and supported historical events idempotently', async () => {
    const repo = memoryRepository();
    const first = await syncScrapmeData({ sourceData, repository: repo });

    expect(first).toMatchObject({ customersProcessed: 1, customersCreated: 1, eventsCreated: 4, errors: 0 });
    expect(repo.customers[0]).toMatchObject({ scrapmeUserId: 'u1', email: 'asha@example.com', referralCode: 'MAYA10', acquisitionSource: 'referral', totalOrders: 1, completedOrders: 1, totalRevenue: 500 });
    expect(repo.events.map((event) => event.eventType)).toEqual(expect.arrayContaining(['request_submitted', 'pickup_assigned', 'pickup_completed', 'payment_completed']));

    const second = await syncScrapmeData({ sourceData, repository: repo });
    expect(second.eventsCreated).toBe(0);
    expect(repo.customers).toHaveLength(1);
    expect(repo.events).toHaveLength(4);
  });

  it('matches customers by normalized email, then phone, while preserving existing marketing attribution', async () => {
    const byEmail = memoryRepository([{ _id: 'existing-email', email: 'asha@example.com', acquisitionSource: 'instagram', acquisitionMedium: 'social' }]);
    await syncScrapmeData({ sourceData: { ...sourceData, pickupOrders: [] }, repository: byEmail });
    expect(byEmail.customers).toHaveLength(1);
    expect(byEmail.customers[0]).toMatchObject({ scrapmeUserId: 'u1', acquisitionSource: 'instagram', acquisitionMedium: 'social' });

    const byPhone = memoryRepository([{ _id: 'existing-phone', phone: '+919876543210' }]);
    await syncScrapmeData({ sourceData: { ...sourceData, users: [{ ...sourceData.users[0], email: '' }], pickupOrders: [] }, repository: byPhone });
    expect(byPhone.customers).toHaveLength(1);
    expect(byPhone.customers[0].scrapmeUserId).toBe('u1');

    const direct = memoryRepository([{ _id: 'direct', email: 'asha@example.com', acquisitionSource: 'direct', acquisitionMedium: 'organic', referralCode: 'ORIGINAL' }]);
    await syncScrapmeData({ sourceData, repository: direct });
    expect(direct.customers[0]).toMatchObject({ acquisitionSource: 'direct', acquisitionMedium: 'organic', referralCode: 'ORIGINAL' });
  });

  it('does not infer payment completion without a completed pickup and final price, and dry runs do not write', async () => {
    const repo = memoryRepository();
    const noPayment = { ...sourceData, pickupOrders: [{ ...sourceData.pickupOrders[0], status: 'picked_up', finalPrice: undefined }] };
    const result = await syncScrapmeData({ sourceData: noPayment, repository: repo, dryRun: true });
    expect(result.eventsCreated).toBe(3); // request submitted, assigned, picked up
    expect(repo.customers).toHaveLength(0);
    expect(repo.events).toHaveLength(0);
  });

  it('uses deterministic earliest timestamped attribution and never invents event timestamps', async () => {
    const repo = memoryRepository();
    const conflicting = {
      ...sourceData,
      requests: [
        { _id: 'r-later', userId: 'u1', referralCode: 'LATER', createdAt: '2026-02-02' },
        { _id: 'r-early', userId: 'u1', influencerId: 'influencer-1', createdAt: '2026-01-02' },
      ],
      pickupOrders: [{ _id: 'p-no-time', requestId: 'r-early', status: 'completed', finalPrice: 500 }],
    };
    const result = await syncScrapmeData({ sourceData: conflicting, repository: repo });
    expect(repo.customers[0]).toMatchObject({ influencerId: 'influencer-1', acquisitionSource: 'influencer' });
    expect(repo.events.map((event) => event.eventType)).toEqual(['request_submitted', 'request_submitted']);
    expect(result.errorDetails).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'missing_event_evidence', sourceId: 'p-no-time' })]));
  });

  it('requires explicit timestamps and a positive finite final price for historical pickup events', () => {
    expect(sourceEventsForPickup({ _id: 'p', status: 'completed', finalPrice: 10 }, 'c')).toEqual([]);
    expect(sourceEventsForPickup({ _id: 'p', status: 'completed', startedAt: '2026-01-01', finalPrice: null }, 'c').map((e) => e.eventType)).toEqual(['pickup_assigned']);
    [null, undefined, '', '  ', 0, -1, NaN, Infinity].forEach((value) => expect(isValidRevenue(value)).toBe(false));
    expect(isValidRevenue('25.5')).toBe(true);
    expect(sourceEventsForPickup({ _id: 'p', status: 'completed', completedAt: '2026-01-02', finalPrice: 20 }, 'c').map((e) => e.eventType)).toEqual(['pickup_completed', 'payment_completed']);
  });
});
