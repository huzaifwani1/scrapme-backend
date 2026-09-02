const Customer = require('../models/Customer');
const CustomerEvent = require('../models/CustomerEvent');
const preferenceService = require('./preferenceService');

const PRECEDENCE_ORDER = [
  'abandoned_request',
  'high_value_reactivation',
  'first_completion_followup',
  'inactive_customer_followup',
  'dormant_customer_reactivation',
  'never_completed',
  'repeat_seller_nurture',
  'new_customer_onboarding'
];

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function daysBetween(older, newer) {
  return Math.max(0, Math.floor((newer.getTime() - older.getTime()) / 86400000));
}

function calculatePriorityScore(baseScore, customer, inactivityDays) {
  let score = baseScore;

  // Value Bonus
  if ((customer.totalRevenue || 0) >= 1000) {
    score += 10;
  }
  if ((customer.completedOrders || 0) >= 2) {
    score += 5;
  }

  // Recency Penalty
  if (inactivityDays > 180) {
    score -= 10;
  }

  // Bounded between 0 and 100
  return Math.min(100, Math.max(0, score));
}

function getPriorityTier(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 65) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

/**
 * Stage 1: Evaluate candidate opportunities independently for a single customer
 */
async function evaluateCustomerOpportunities(customer, context = {}, now = new Date()) {
  const completedOrders = Number(customer.completedOrders) || 0;
  const totalOrders = Number(customer.totalOrders) || 0;
  const totalRevenue = Number(customer.totalRevenue) || 0;
  const createdAt = validDate(customer.createdAt) || validDate(customer.firstSeenAt) || now;
  const lastActivityAt = validDate(customer.lastActivityAt) || createdAt;

  const inactivityDays = daysBetween(lastActivityAt, now);
  const accountAgeDays = daysBetween(createdAt, now);

  const hasAbandonedEvent = Boolean(context.hasAbandonedRequest);
  const hasHighIntentEvent = Boolean(context.hasHighIntentEvent);
  const isUnsubscribed = customer.unsubscribed === true;
  const hasContactInfo = Boolean((customer.email && customer.email.trim()) || (customer.phone && customer.phone.trim()));

  const candidates = [];

  // 1. abandoned_request
  const isAbandonedEligible = hasAbandonedEvent && !isUnsubscribed && hasContactInfo;
  const abandonedScore = calculatePriorityScore(80, customer, inactivityDays);
  candidates.push({
    opportunityType: 'abandoned_request',
    recommendedAction: 'request_recovery_followup',
    baseScore: 80,
    priorityScore: abandonedScore,
    priorityTier: getPriorityTier(abandonedScore),
    isEligible: isAbandonedEligible,
    exclusionReason: !hasAbandonedEvent
      ? 'No explicit request_abandoned event'
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No email or phone contact details available'
      : null,
    explanation: `Customer submitted a quote/request but recorded a request_abandoned event. Primary action is request recovery.`
  });

  // 2. high_value_reactivation
  const isHighValueEligible = totalRevenue >= 1000 && inactivityDays >= 30 && !isUnsubscribed && hasContactInfo;
  const highValueScore = calculatePriorityScore(75, customer, inactivityDays);
  candidates.push({
    opportunityType: 'high_value_reactivation',
    recommendedAction: 'vip_reactivation_offer',
    baseScore: 75,
    priorityScore: highValueScore,
    priorityTier: getPriorityTier(highValueScore),
    isEligible: isHighValueEligible,
    exclusionReason: totalRevenue < 1000
      ? `Historical revenue (${totalRevenue}) is below 1000 threshold`
      : inactivityDays < 30
      ? `Inactivity duration (${inactivityDays} days) is less than 30 days`
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No contact details available'
      : null,
    explanation: `Customer generated Rs. ${totalRevenue} in historical revenue but has been inactive for ${inactivityDays} days. Primary action is VIP reactivation offer.`
  });

  // 3. first_completion_followup
  const isFirstCompletionEligible = completedOrders === 1 && inactivityDays <= 14 && !isUnsubscribed && hasContactInfo;
  const firstCompletionScore = calculatePriorityScore(65, customer, inactivityDays);
  candidates.push({
    opportunityType: 'first_completion_followup',
    recommendedAction: 'second_order_onboarding',
    baseScore: 65,
    priorityScore: firstCompletionScore,
    priorityTier: getPriorityTier(firstCompletionScore),
    isEligible: isFirstCompletionEligible,
    exclusionReason: completedOrders !== 1
      ? `Completed orders count (${completedOrders}) is not exactly 1`
      : inactivityDays > 14
      ? `Inactivity duration (${inactivityDays} days) exceeds 14 day window`
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No contact details available'
      : null,
    explanation: `Customer completed their 1st pickup ${inactivityDays} days ago. Primary action is second order onboarding.`
  });

  // 4. inactive_customer_followup
  const isInactiveEligible = completedOrders >= 1 && inactivityDays >= 30 && inactivityDays <= 59 && !isUnsubscribed && hasContactInfo;
  const inactiveScore = calculatePriorityScore(55, customer, inactivityDays);
  candidates.push({
    opportunityType: 'inactive_customer_followup',
    recommendedAction: 'reengagement_nurture',
    baseScore: 55,
    priorityScore: inactiveScore,
    priorityTier: getPriorityTier(inactiveScore),
    isEligible: isInactiveEligible,
    exclusionReason: completedOrders < 1
      ? 'Customer has 0 completed orders'
      : inactivityDays < 30 || inactivityDays > 59
      ? `Inactivity duration (${inactivityDays} days) is outside 30-59 day window`
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No contact details available'
      : null,
    explanation: `Customer completed ${completedOrders} pickups but has been inactive for ${inactivityDays} days. Primary action is re-engagement nurture.`
  });

  // 5. dormant_customer_reactivation
  const isDormantEligible = inactivityDays >= 60 && !isUnsubscribed && hasContactInfo;
  const dormantScore = calculatePriorityScore(45, customer, inactivityDays);
  candidates.push({
    opportunityType: 'dormant_customer_reactivation',
    recommendedAction: 'winback_campaign',
    baseScore: 45,
    priorityScore: dormantScore,
    priorityTier: getPriorityTier(dormantScore),
    isEligible: isDormantEligible,
    exclusionReason: inactivityDays < 60
      ? `Inactivity duration (${inactivityDays} days) is less than 60 days`
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No contact details available'
      : null,
    explanation: `Customer has been dormant with no activity for ${inactivityDays} days. Primary action is win-back campaign.`
  });

  // 6. never_completed
  const hasSellingIntent = (totalOrders > 0 || hasHighIntentEvent);
  const isNeverCompletedEligible = hasSellingIntent && completedOrders === 0 && !hasAbandonedEvent && !isUnsubscribed && hasContactInfo;
  const neverCompletedScore = calculatePriorityScore(40, customer, inactivityDays);
  candidates.push({
    opportunityType: 'never_completed',
    recommendedAction: 'first_quote_encouragement',
    baseScore: 40,
    priorityScore: neverCompletedScore,
    priorityTier: getPriorityTier(neverCompletedScore),
    isEligible: isNeverCompletedEligible,
    exclusionReason: !hasSellingIntent
      ? 'No meaningful selling/request intent events (quote_created, request_started, request_submitted)'
      : completedOrders > 0
      ? 'Customer has completed orders'
      : hasAbandonedEvent
      ? 'Customer has explicit request_abandoned event'
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No contact details available'
      : null,
    explanation: `Customer demonstrated high-intent selling activity (quote or request started/submitted) but has 0 completed pickups. Primary action is first quote encouragement.`
  });

  // 7. repeat_seller_nurture
  const isRepeatSellerEligible = completedOrders >= 2 && inactivityDays < 30 && !isUnsubscribed && hasContactInfo;
  const repeatSellerScore = calculatePriorityScore(35, customer, inactivityDays);
  candidates.push({
    opportunityType: 'repeat_seller_nurture',
    recommendedAction: 'loyalty_appreciation',
    baseScore: 35,
    priorityScore: repeatSellerScore,
    priorityTier: getPriorityTier(repeatSellerScore),
    isEligible: isRepeatSellerEligible,
    exclusionReason: completedOrders < 2
      ? `Completed orders count (${completedOrders}) is less than 2`
      : inactivityDays >= 30
      ? `Inactivity duration (${inactivityDays} days) is 30 days or greater`
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No contact details available'
      : null,
    explanation: `Active repeat seller with ${completedOrders} completed pickups. Primary action is loyalty appreciation.`
  });

  // 8. new_customer_onboarding
  const isNewCustomerEligible = completedOrders === 0 && accountAgeDays <= 30 && !hasAbandonedEvent && !hasSellingIntent && !isUnsubscribed && hasContactInfo;
  const newCustomerScore = calculatePriorityScore(30, customer, inactivityDays);
  candidates.push({
    opportunityType: 'new_customer_onboarding',
    recommendedAction: 'welcome_guidance',
    baseScore: 30,
    priorityScore: newCustomerScore,
    priorityTier: getPriorityTier(newCustomerScore),
    isEligible: isNewCustomerEligible,
    exclusionReason: completedOrders > 0
      ? 'Customer has completed orders'
      : accountAgeDays > 30
      ? `Account age (${accountAgeDays} days) exceeds 30 days`
      : hasAbandonedEvent
      ? 'Customer has abandoned request'
      : hasSellingIntent
      ? 'Customer has high-intent request/quote events'
      : isUnsubscribed
      ? 'Customer is unsubscribed'
      : !hasContactInfo
      ? 'No contact details available'
      : null,
    explanation: `New customer registered ${accountAgeDays} days ago with 0 order history. Primary action is welcome guidance.`
  });

  return candidates;
}

/**
 * Stage 2: Rank eligible candidates deterministically and select ONE primary opportunity
 */
function selectPrimaryOpportunity(candidates) {
  const eligible = candidates.filter(c => c.isEligible);
  if (eligible.length === 0) {
    return null;
  }

  // Deterministic Sort:
  // 1. Higher priorityScore first
  // 2. Tie-breaker: PRECEDENCE_ORDER fixed rank
  eligible.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    const indexA = PRECEDENCE_ORDER.indexOf(a.opportunityType);
    const indexB = PRECEDENCE_ORDER.indexOf(b.opportunityType);
    return indexA - indexB;
  });

  return eligible[0];
}

/**
 * Evaluate Channel Intelligence for email, sms, whatsapp
 */
async function evaluateChannelIntelligence(customer) {
  const hasEmail = Boolean(customer.email && customer.email.trim());
  const hasPhone = Boolean(customer.phone && customer.phone.trim());
  const isUnsubscribed = customer.unsubscribed === true;

  if (isUnsubscribed) {
    return {
      eligibleChannels: [],
      recommendedChannel: null,
      channelRecommendationSupported: false,
      reason: 'Customer is unsubscribed from all channels'
    };
  }

  const customerId = customer._id;
  const [optInEmail, optInSms, optInWhatsapp] = await Promise.all([
    hasEmail ? preferenceService.isOptedIn(customerId, 'email', 'marketing') : Promise.resolve(false),
    hasPhone ? preferenceService.isOptedIn(customerId, 'sms', 'marketing') : Promise.resolve(false),
    hasPhone ? preferenceService.isOptedIn(customerId, 'whatsapp', 'marketing') : Promise.resolve(false)
  ]);

  const eligibleChannels = [];
  if (hasEmail && optInEmail) eligibleChannels.push('email');
  if (hasPhone && optInSms) eligibleChannels.push('sms');
  if (hasPhone && optInWhatsapp) eligibleChannels.push('whatsapp');

  let recommendedChannel = null;
  let channelRecommendationSupported = false;
  let reason = '';

  if (eligibleChannels.length === 0) {
    reason = 'No contact details available or opted-out of all channels';
  } else if (eligibleChannels.length === 1) {
    recommendedChannel = eligibleChannels[0];
    channelRecommendationSupported = true;
    reason = `Single contactable and opted-in channel: ${eligibleChannels[0]}`;
  } else {
    recommendedChannel = null;
    channelRecommendationSupported = false;
    reason = 'Multiple channels are eligible; no stored historical channel conversion performance evidence exists to rank channels';
  }

  return {
    eligibleChannels,
    recommendedChannel,
    channelRecommendationSupported,
    reason
  };
}

/**
 * Batch Event Context Aggregation for Customer Intelligence
 */
async function getCustomerEventContexts(customerIds) {
  if (!customerIds || !customerIds.length) return new Map();

  const HIGH_INTENT_EVENT_TYPES = ['quote_created', 'request_started', 'request_submitted'];

  const results = await CustomerEvent.aggregate([
    {
      $match: {
        customerId: { $in: customerIds }
      }
    },
    {
      $group: {
        _id: '$customerId',
        hasAbandonedRequest: {
          $sum: { $cond: [{ $eq: ['$eventType', 'request_abandoned'] }, 1, 0] }
        },
        hasHighIntentEvent: {
          $sum: { $cond: [{ $in: ['$eventType', HIGH_INTENT_EVENT_TYPES] }, 1, 0] }
        }
      }
    }
  ]);

  const map = new Map();
  customerIds.forEach(id => {
    map.set(String(id), { hasAbandonedRequest: false, hasHighIntentEvent: false });
  });

  results.forEach(item => {
    map.set(String(item._id), {
      hasAbandonedRequest: item.hasAbandonedRequest > 0,
      hasHighIntentEvent: item.hasHighIntentEvent > 0
    });
  });

  return map;
}

/**
 * Single Customer Intelligence Profile
 */
async function getCustomerIntelligenceProfile(customerId, now = new Date()) {
  const customer = await Customer.findById(customerId).lean();
  if (!customer) {
    const err = new Error('Customer not found');
    err.statusCode = 404;
    throw err;
  }

  const contextsMap = await getCustomerEventContexts([customer._id]);
  const context = contextsMap.get(String(customer._id)) || { hasAbandonedRequest: false, hasHighIntentEvent: false };

  const candidates = await evaluateCustomerOpportunities(customer, context, now);
  const primaryOpportunity = selectPrimaryOpportunity(candidates);
  const channelIntel = await evaluateChannelIntelligence(customer);

  const createdAt = validDate(customer.createdAt) || validDate(customer.firstSeenAt) || now;
  const lastActivityAt = validDate(customer.lastActivityAt) || createdAt;
  const inactivityDays = daysBetween(lastActivityAt, now);

  const isAllChannelsBlocked = channelIntel.eligibleChannels.length === 0;
  const isUnsubscribed = customer.unsubscribed === true || isAllChannelsBlocked;

  return {
    customerIdentity: {
      customerId: String(customer._id),
      scrapmeUserId: customer.scrapmeUserId || null,
      name: customer.name || '',
      email: customer.email || null,
      phone: customer.phone || null,
      customerStatus: customer.customerStatus || 'new'
    },
    availableIntelligenceSignals: {
      acquisitionSource: customer.acquisitionSource || 'direct',
      totalOrders: Number(customer.totalOrders) || 0,
      completedOrders: Number(customer.completedOrders) || 0,
      totalRevenue: Number(customer.totalRevenue) || 0,
      inactivityDays,
      hasAbandonedRequest: context.hasAbandonedRequest,
      hasHighIntentEvent: context.hasHighIntentEvent
    },
    opportunityCandidates: candidates,
    selectedPrimaryOpportunity: primaryOpportunity ? {
      opportunityType: primaryOpportunity.opportunityType,
      recommendedAction: primaryOpportunity.recommendedAction,
      priorityScore: primaryOpportunity.priorityScore,
      priorityTier: primaryOpportunity.priorityTier,
      explanation: primaryOpportunity.explanation
    } : null,
    primaryRecommendedAction: primaryOpportunity ? primaryOpportunity.recommendedAction : null,
    priorityScore: primaryOpportunity ? primaryOpportunity.priorityScore : 0,
    priorityTier: primaryOpportunity ? primaryOpportunity.priorityTier : 'LOW',
    explanation: primaryOpportunity ? primaryOpportunity.explanation : 'No active actionable opportunity found for customer.',
    channelIntelligence: channelIntel,
    timingIntelligence: {
      timingRecommendationSupported: false,
      reason: 'Customer-specific optimal contact timing is not currently stored'
    },
    suppressionState: {
      isUnsubscribed,
      blockedChannels: isAllChannelsBlocked ? ['email', 'sms', 'whatsapp'] : []
    }
  };
}

/**
 * Macro Summary Analytics for Intelligence Dashboard
 */
async function getIntelligenceSummary({ now = new Date() } = {}) {
  const customers = await Customer.find({}).lean();
  const totalCustomers = customers.length;

  if (totalCustomers === 0) {
    return {
      totalCustomersAnalyzed: 0,
      actionableOpportunitiesCount: 0,
      priorityBreakdown: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      opportunityTypeBreakdown: {
        abandoned_request: 0,
        high_value_reactivation: 0,
        first_completion_followup: 0,
        inactive_customer_followup: 0,
        dormant_customer_reactivation: 0,
        never_completed: 0,
        repeat_seller_nurture: 0,
        new_customer_onboarding: 0
      },
      blockedBySuppressionCount: 0
    };
  }

  const contextsMap = await getCustomerEventContexts(customers.map(c => c._id));

  let actionableCount = 0;
  let suppressedCount = 0;
  const priorityBreakdown = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const opportunityTypeBreakdown = {
    abandoned_request: 0,
    high_value_reactivation: 0,
    first_completion_followup: 0,
    inactive_customer_followup: 0,
    dormant_customer_reactivation: 0,
    never_completed: 0,
    repeat_seller_nurture: 0,
    new_customer_onboarding: 0
  };

  for (const customer of customers) {
    if (customer.unsubscribed === true) {
      suppressedCount += 1;
    }
    const context = contextsMap.get(String(customer._id)) || {};
    const candidates = await evaluateCustomerOpportunities(customer, context, now);
    const primary = selectPrimaryOpportunity(candidates);

    if (primary) {
      actionableCount += 1;
      priorityBreakdown[primary.priorityTier] = (priorityBreakdown[primary.priorityTier] || 0) + 1;
      opportunityTypeBreakdown[primary.opportunityType] = (opportunityTypeBreakdown[primary.opportunityType] || 0) + 1;
    }
  }

  return {
    totalCustomersAnalyzed: totalCustomers,
    actionableOpportunitiesCount: actionableCount,
    priorityBreakdown,
    opportunityTypeBreakdown,
    blockedBySuppressionCount: suppressedCount
  };
}

/**
 * Paginated Customer Opportunities List
 */
async function getOpportunitiesList({ page = 1, limit = 50, priorityTier, opportunityType, now = new Date() } = {}) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit) || 50));

  const customers = await Customer.find({}).lean();
  const contextsMap = await getCustomerEventContexts(customers.map(c => c._id));

  let results = [];

  for (const customer of customers) {
    const context = contextsMap.get(String(customer._id)) || {};
    const candidates = await evaluateCustomerOpportunities(customer, context, now);
    const primary = selectPrimaryOpportunity(candidates);

    if (primary) {
      if (priorityTier && primary.priorityTier !== priorityTier) continue;
      if (opportunityType && primary.opportunityType !== opportunityType) continue;

      results.push({
        customerId: String(customer._id),
        customerName: customer.name || '',
        customerEmail: customer.email || null,
        customerPhone: customer.phone || null,
        opportunityType: primary.opportunityType,
        recommendedAction: primary.recommendedAction,
        priorityScore: primary.priorityScore,
        priorityTier: primary.priorityTier,
        explanation: primary.explanation
      });
    }
  }

  // Sort by priorityScore descending
  results.sort((a, b) => b.priorityScore - a.priorityScore);

  const total = results.length;
  const totalPages = Math.ceil(total / l) || 1;
  const paginated = results.slice((p - 1) * l, p * l);

  return {
    opportunities: paginated,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages
    }
  };
}

/**
 * Paginated Ranked Next-Best-Actions
 */
async function getNextBestActions({ page = 1, limit = 50, priorityTier, opportunityType, now = new Date() } = {}) {
  const data = await getOpportunitiesList({ page, limit, priorityTier, opportunityType, now });
  return {
    nextBestActions: data.opportunities,
    pagination: data.pagination
  };
}

module.exports = {
  PRECEDENCE_ORDER,
  calculatePriorityScore,
  getPriorityTier,
  evaluateCustomerOpportunities,
  selectPrimaryOpportunity,
  evaluateChannelIntelligence,
  getCustomerEventContexts,
  getCustomerIntelligenceProfile,
  getIntelligenceSummary,
  getOpportunitiesList,
  getNextBestActions
};
