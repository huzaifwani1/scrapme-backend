const Customer = require('../models/Customer');
const CustomerEvent = require('../models/CustomerEvent');
const Campaign = require('../models/Campaign');
const CampaignExecution = require('../models/CampaignExecution');
const MessageIntent = require('../models/MessageIntent');
const MessageLog = require('../models/MessageLog');
const { calculateCustomerSegments, eventContexts } = require('./segmentationService');

function parseDateRange(startDateStr, endDateStr) {
  let startDate = null;
  let endDate = null;

  if (startDateStr) {
    startDate = new Date(startDateStr);
    if (Number.isNaN(startDate.getTime())) {
      const err = new Error('Invalid startDate format');
      err.statusCode = 400;
      throw err;
    }
  }

  if (endDateStr) {
    endDate = new Date(endDateStr);
    if (Number.isNaN(endDate.getTime())) {
      const err = new Error('Invalid endDate format');
      err.statusCode = 400;
      throw err;
    }
  }

  if (startDate && endDate && startDate > endDate) {
    const err = new Error('startDate cannot be after endDate');
    err.statusCode = 400;
    throw err;
  }

  return { startDate, endDate };
}

function buildDateMatchFilter(dateField, startDate, endDate) {
  const filter = {};
  if (startDate || endDate) {
    filter[dateField] = {};
    if (startDate) filter[dateField].$gte = startDate;
    if (endDate) filter[dateField].$lte = endDate;
  }
  return filter;
}

function safeRatio(numerator, denominator, multiplier = 100) {
  if (!denominator || denominator === 0) return 0;
  const ratio = (numerator / denominator) * multiplier;
  return Number(ratio.toFixed(2));
}

/**
 * 1. Overview Analytics
 */
async function getOverviewAnalytics({ startDate, endDate }) {
  const dateRange = parseDateRange(startDate, endDate);
  const custDateFilter = buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate);
  const eventDateFilter = buildDateMatchFilter('timestamp', dateRange.startDate, dateRange.endDate);

  const [
    totalCustomers,
    acquiredInPeriod,
    requestEvents,
    completedEvents,
    activeCampaignsCount,
    customerOrderStats
  ] = await Promise.all([
    Customer.countDocuments({}),
    Customer.countDocuments(custDateFilter),
    CustomerEvent.countDocuments({ eventType: 'request_submitted', ...eventDateFilter }),
    CustomerEvent.countDocuments({ eventType: { $in: ['pickup_completed', 'payment_completed'] }, ...eventDateFilter }),
    Campaign.countDocuments({ status: 'active' }),
    Customer.aggregate([
      {
        $group: {
          _id: null,
          totalCompletedOrders: { $sum: '$completedOrders' },
          totalRevenue: { $sum: '$totalRevenue' },
          buyersWithOne: { $sum: { $cond: [{ $eq: ['$completedOrders', 1] }, 1, 0] } },
          buyersWithMultiple: { $sum: { $cond: [{ $gte: ['$completedOrders', 2] }, 1, 0] } }
        }
      }
    ])
  ]);

  const stats = customerOrderStats[0] || { totalCompletedOrders: 0, totalRevenue: 0, buyersWithOne: 0, buyersWithMultiple: 0 };
  const totalBuyers = stats.buyersWithOne + stats.buyersWithMultiple;
  const repeatRate = safeRatio(stats.buyersWithMultiple, totalBuyers);

  return {
    period: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
      endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
    },
    metrics: {
      totalCustomers,
      acquiredInPeriod,
      requestsSubmitted: requestEvents,
      completedPickups: completedEvents,
      totalCompletedOrders: stats.totalCompletedOrders,
      totalRevenue: Number(stats.totalRevenue.toFixed(2)),
      repeatBuyerCount: stats.buyersWithMultiple,
      repeatRatePercent: repeatRate,
      activeCampaigns: activeCampaignsCount,
    }
  };
}

/**
 * 2. Acquisition Analytics
 */
async function getAcquisitionAnalytics({ startDate, endDate }) {
  const dateRange = parseDateRange(startDate, endDate);
  const matchCustomer = buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate);

  const sources = ['google', 'instagram', 'influencer', 'direct', 'referral', 'other'];

  const [customerAcquisition, eventAcquisition] = await Promise.all([
    Customer.aggregate([
      { $match: matchCustomer },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: [{ $toLower: '$acquisitionSource' }, 'google'] }, then: 'google' },
                { case: { $eq: [{ $toLower: '$acquisitionSource' }, 'instagram'] }, then: 'instagram' },
                { case: { $eq: [{ $toLower: '$acquisitionSource' }, 'influencer'] }, then: 'influencer' },
                { case: { $eq: [{ $toLower: '$acquisitionSource' }, 'direct'] }, then: 'direct' },
                { case: { $eq: [{ $toLower: '$acquisitionSource' }, 'referral'] }, then: 'referral' }
              ],
              default: 'other'
            }
          },
          count: { $sum: 1 },
          completedOrders: { $sum: '$completedOrders' },
          totalRevenue: { $sum: '$totalRevenue' }
        }
      }
    ]),
    CustomerEvent.aggregate([
      {
        $match: {
          eventType: { $in: ['request_submitted', 'pickup_completed', 'payment_completed'] },
          ...buildDateMatchFilter('timestamp', dateRange.startDate, dateRange.endDate)
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: '$customer' },
      {
        $group: {
          _id: {
            source: {
              $switch: {
                branches: [
                  { case: { $eq: [{ $toLower: '$customer.acquisitionSource' }, 'google'] }, then: 'google' },
                  { case: { $eq: [{ $toLower: '$customer.acquisitionSource' }, 'instagram'] }, then: 'instagram' },
                  { case: { $eq: [{ $toLower: '$customer.acquisitionSource' }, 'influencer'] }, then: 'influencer' },
                  { case: { $eq: [{ $toLower: '$customer.acquisitionSource' }, 'direct'] }, then: 'direct' },
                  { case: { $eq: [{ $toLower: '$customer.acquisitionSource' }, 'referral'] }, then: 'referral' }
                ],
                default: 'other'
              }
            },
            type: '$eventType'
          },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const custMap = new Map(customerAcquisition.map(item => [item._id, item]));
  const eventMap = new Map();
  eventAcquisition.forEach(item => {
    const key = `${item._id.source}:${item._id.type}`;
    eventMap.set(key, item.count);
  });

  const channelBreakdown = sources.map(source => {
    const custData = custMap.get(source) || { count: 0, completedOrders: 0, totalRevenue: 0 };
    const requests = eventMap.get(`${source}:request_submitted`) || 0;
    const completedPickups = (eventMap.get(`${source}:pickup_completed`) || 0) + (eventMap.get(`${source}:payment_completed`) || 0);

    return {
      source,
      customersAcquired: custData.count,
      requestsGenerated: requests,
      completedPickups: completedPickups || custData.completedOrders,
      revenueGenerated: Number(custData.totalRevenue.toFixed(2)),
      conversionRatePercent: safeRatio(completedPickups || custData.completedOrders, custData.count)
    };
  });

  return {
    period: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
      endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
    },
    attribution: {
      firstTouch: {
        supported: true
      },
      latestTouch: {
        supported: false,
        reason: 'Latest-touch attribution is not stored in the Customer schema'
      }
    },
    channels: channelBreakdown
  };
}

/**
 * 3. Funnel Analytics
 */
async function getFunnelAnalytics({ startDate, endDate }) {
  const dateRange = parseDateRange(startDate, endDate);
  const custFilter = buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate);
  const eventFilter = buildDateMatchFilter('timestamp', dateRange.startDate, dateRange.endDate);

  const [
    signupCount,
    requestCount,
    scheduledCount,
    completedCount,
    repeatCount
  ] = await Promise.all([
    Customer.countDocuments(custFilter),
    CustomerEvent.distinct('customerId', { eventType: 'request_submitted', ...eventFilter }).then(res => res.length),
    CustomerEvent.distinct('customerId', { eventType: 'pickup_assigned', ...eventFilter }).then(res => res.length),
    CustomerEvent.distinct('customerId', { eventType: { $in: ['pickup_completed', 'payment_completed'] }, ...eventFilter }).then(res => res.length),
    Customer.countDocuments({ completedOrders: { $gte: 2 }, ...custFilter })
  ]);

  const stages = [
    {
      stage: 'Visitor',
      count: null,
      conversionRatePercent: null,
      dropOffCount: null,
      dropOffPercent: null,
      unavailable: true,
      reason: 'Visitor tracking data is not integrated into Growth Engine'
    },
    {
      stage: 'Signup',
      count: signupCount,
      conversionRatePercent: 100,
      dropOffCount: 0,
      dropOffPercent: 0
    },
    {
      stage: 'Request',
      count: requestCount,
      conversionRatePercent: safeRatio(requestCount, signupCount),
      dropOffCount: Math.max(0, signupCount - requestCount),
      dropOffPercent: safeRatio(Math.max(0, signupCount - requestCount), signupCount)
    },
    {
      stage: 'Scheduled',
      count: scheduledCount,
      conversionRatePercent: safeRatio(scheduledCount, requestCount),
      dropOffCount: Math.max(0, requestCount - scheduledCount),
      dropOffPercent: safeRatio(Math.max(0, requestCount - scheduledCount), requestCount)
    },
    {
      stage: 'Completed',
      count: completedCount,
      conversionRatePercent: safeRatio(completedCount, scheduledCount),
      dropOffCount: Math.max(0, scheduledCount - completedCount),
      dropOffPercent: safeRatio(Math.max(0, scheduledCount - completedCount), scheduledCount)
    },
    {
      stage: 'Repeat',
      count: repeatCount,
      conversionRatePercent: safeRatio(repeatCount, completedCount),
      dropOffCount: Math.max(0, completedCount - repeatCount),
      dropOffPercent: safeRatio(Math.max(0, completedCount - repeatCount), completedCount)
    }
  ];

  return {
    period: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
      endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
    },
    funnel: stages
  };
}

/**
 * 4. Lifecycle Analytics
 */
async function getLifecycleAnalytics({ startDate, endDate }) {
  const dateRange = parseDateRange(startDate, endDate);
  const filter = buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate);

  const customers = await Customer.find(filter).lean();
  const totalCustomers = customers.length;

  if (totalCustomers === 0) {
    return {
      period: {
        startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
        endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
      },
      totalCustomers: 0,
      stages: {}
    };
  }

  const contexts = await eventContexts(customers.map(c => c._id));
  const counts = {
    new: 0,
    active: 0,
    engaged: 0,
    inactive: 0,
    dormant: 0,
    churned: 0,
    reactivated: 0,
    first_time_seller: 0,
    repeat_seller: 0
  };

  customers.forEach(customer => {
    const ctx = contexts.get(String(customer._id));
    const segments = calculateCustomerSegments(customer, ctx);
    const segKeys = new Set(segments.map(s => s.segmentKey));

    if (segKeys.has('new_customer')) counts.new += 1;
    if (segKeys.has('first_time_seller')) counts.first_time_seller += 1;
    if (segKeys.has('repeat_seller')) counts.repeat_seller += 1;
    if (segKeys.has('inactive_customer')) counts.inactive += 1;
    if (segKeys.has('dormant_customer')) counts.dormant += 1;
    if (segKeys.has('reactivated_customer')) counts.reactivated += 1;

    const status = customer.customerStatus || 'new';
    if (status === 'active') counts.active += 1;
    if (status === 'engaged') counts.engaged += 1;
    if (status === 'churned') counts.churned += 1;
  });

  const stagesResult = {};
  Object.keys(counts).forEach(key => {
    stagesResult[key] = {
      count: counts[key],
      percentage: safeRatio(counts[key], totalCustomers)
    };
  });

  return {
    period: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
      endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
    },
    totalCustomers,
    stages: stagesResult
  };
}

/**
 * 5. Revenue Analytics
 */
async function getRevenueAnalytics({ startDate, endDate }) {
  const dateRange = parseDateRange(startDate, endDate);
  const custFilter = buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate);

  const [overallStats, sourceBreakdown, influencerBreakdown] = await Promise.all([
    Customer.aggregate([
      { $match: custFilter },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalRevenue' },
          totalCompletedOrders: { $sum: '$completedOrders' }
        }
      }
    ]),
    Customer.aggregate([
      { $match: custFilter },
      {
        $group: {
          _id: { $toLower: '$acquisitionSource' },
          revenue: { $sum: '$totalRevenue' },
          completedOrders: { $sum: '$completedOrders' }
        }
      }
    ]),
    Customer.aggregate([
      {
        $match: {
          $or: [
            { influencerId: { $ne: null, $gt: '' } },
            { referralCode: { $ne: null, $gt: '' } }
          ],
          ...custFilter
        }
      },
      {
        $group: {
          _id: {
            influencerId: '$influencerId',
            referralCode: '$referralCode'
          },
          revenue: { $sum: '$totalRevenue' },
          completedOrders: { $sum: '$completedOrders' },
          customerCount: { $sum: 1 }
        }
      }
    ])
  ]);

  const stats = overallStats[0] || { totalRevenue: 0, totalCompletedOrders: 0 };
  const totalRevenue = Number(stats.totalRevenue.toFixed(2));
  const totalCompletedTransactions = stats.totalCompletedOrders;
  const arpu = safeRatio(totalRevenue, totalCompletedTransactions, 1);

  const bySource = sourceBreakdown.map(item => ({
    source: item._id || 'direct',
    revenue: Number(item.revenue.toFixed(2)),
    completedTransactions: item.completedOrders,
    arpu: safeRatio(item.revenue, item.completedOrders, 1)
  }));

  const byInfluencer = influencerBreakdown.map(item => ({
    influencerId: item._id.influencerId || null,
    referralCode: item._id.referralCode || null,
    customersAcquired: item.customerCount,
    revenue: Number(item.revenue.toFixed(2)),
    completedTransactions: item.completedOrders
  }));

  return {
    period: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
      endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
    },
    totalCompletedTransactions,
    totalRevenue,
    averageRevenuePerTransaction: Number(arpu.toFixed(2)),
    revenueBySource: bySource,
    revenueByInfluencer: byInfluencer,
    roi: {
      costDataAvailable: false,
      value: 'cost data unavailable',
      reason: 'Marketing cost/spend data is not integrated in Growth Engine'
    }
  };
}

/**
 * 6. Retention & Reactivation Analytics
 */
async function getRetentionAnalytics({ startDate, endDate }) {
  const dateRange = parseDateRange(startDate, endDate);
  const custFilter = buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate);

  const [customerStats, eventTimestamps] = await Promise.all([
    Customer.aggregate([
      { $match: custFilter },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          firstTimeSellers: { $sum: { $cond: [{ $eq: ['$completedOrders', 1] }, 1, 0] } },
          repeatSellers: { $sum: { $cond: [{ $gte: ['$completedOrders', 2] }, 1, 0] } },
          inactiveCount: { $sum: { $cond: [{ $eq: ['$customerStatus', 'inactive'] }, 1, 0] } },
          dormantCount: { $sum: { $cond: [{ $eq: ['$customerStatus', 'churned'] }, 1, 0] } },
          reactivatedCount: { $sum: { $cond: [{ $eq: ['$customerStatus', 'reactivated'] }, 1, 0] } }
        }
      }
    ]),
    CustomerEvent.aggregate([
      {
        $match: {
          eventType: { $in: ['pickup_completed', 'payment_completed'] }
        }
      },
      { $sort: { customerId: 1, timestamp: 1 } },
      {
        $group: {
          _id: '$customerId',
          timestamps: { $push: '$timestamp' }
        }
      }
    ])
  ]);

  const stats = customerStats[0] || {
    totalCustomers: 0,
    firstTimeSellers: 0,
    repeatSellers: 0,
    inactiveCount: 0,
    dormantCount: 0,
    reactivatedCount: 0
  };

  const totalCompletedSellers = stats.firstTimeSellers + stats.repeatSellers;
  const repeatRate = safeRatio(stats.repeatSellers, totalCompletedSellers);

  let totalIntervalsMs = 0;
  let totalIntervalsCount = 0;

  eventTimestamps.forEach(item => {
    if (item.timestamps && item.timestamps.length > 1) {
      for (let i = 1; i < item.timestamps.length; i++) {
        const gap = new Date(item.timestamps[i]).getTime() - new Date(item.timestamps[i - 1]).getTime();
        if (gap > 0) {
          totalIntervalsMs += gap;
          totalIntervalsCount += 1;
        }
      }
    }
  });

  const avgDaysBetweenTransactions = totalIntervalsCount > 0
    ? Number((totalIntervalsMs / (totalIntervalsCount * 86400000)).toFixed(1))
    : 0;

  return {
    period: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
      endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
    },
    retention: {
      totalCustomers: stats.totalCustomers,
      firstTimeSellers: stats.firstTimeSellers,
      repeatSellers: stats.repeatSellers,
      repeatRatePercent: repeatRate,
      inactiveCustomers: stats.inactiveCount,
      dormantCustomers: stats.dormantCount,
      reactivatedCustomers: stats.reactivatedCount,
      avgDaysBetweenTransactions
    }
  };
}

/**
 * 7. Campaign Analytics
 */
async function getCampaignAnalytics({ startDate, endDate, campaignId }) {
  const dateRange = parseDateRange(startDate, endDate);

  const campaignMatch = {};
  if (campaignId) {
    campaignMatch._id = campaignId;
  }

  const campaigns = await Campaign.find(campaignMatch).lean();

  const campaignMetrics = await Promise.all(campaigns.map(async (camp) => {
    const execFilter = { campaignId: camp._id, ...buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate) };

    const [executions, intents, logs] = await Promise.all([
      CampaignExecution.find(execFilter).lean(),
      MessageIntent.find({ campaignId: camp._id, ...buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate) }).lean(),
      MessageLog.find({ campaignId: camp._id, ...buildDateMatchFilter('createdAt', dateRange.startDate, dateRange.endDate) }).lean()
    ]);

    const executionCount = executions.length;
    const suppressedCount = executions.filter(e => e.status === 'suppressed').length;
    const simulatedIntents = intents.length;
    const deliveryAttempts = logs.length;

    const targetedCustomerIds = [...new Set(executions.map(e => String(e.customerId)))];

    return {
      campaignId: camp._id,
      name: camp.name,
      type: camp.type,
      channel: camp.channel,
      status: camp.status,
      audienceConfig: camp.audience,
      campaignAudience: targetedCustomerIds.length,
      eligibleAudience: Math.max(0, targetedCustomerIds.length - suppressedCount),
      executionCount,
      suppressedCount,
      simulatedMessageIntents: simulatedIntents,
      deliveryAttempts,
      outcomes: {
        attributionSupported: false,
        reason: 'Explicit campaign-to-customer-event linkage is not available',
        attributedRequests: null,
        attributedCompletedPickups: null,
        attributedRevenue: null
      },
      roi: {
        costDataAvailable: false,
        value: 'cost data unavailable',
        reason: 'Campaign spend data is not integrated in Growth Engine'
      }
    };
  }));

  return {
    period: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString() : null,
      endDate: dateRange.endDate ? dateRange.endDate.toISOString() : null,
    },
    campaigns: campaignMetrics
  };
}

module.exports = {
  parseDateRange,
  getOverviewAnalytics,
  getAcquisitionAnalytics,
  getFunnelAnalytics,
  getLifecycleAnalytics,
  getRevenueAnalytics,
  getRetentionAnalytics,
  getCampaignAnalytics
};
