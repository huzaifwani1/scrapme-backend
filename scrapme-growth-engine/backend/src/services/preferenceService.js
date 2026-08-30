'use strict';

const CommunicationPreference = require('../models/CommunicationPreference');

/**
 * preferenceService — Manages customer communication opt-in/opt-out state.
 *
 * Resolution logic for isOptedIn():
 *   1. Look for a specific (channel + messageType) preference record.
 *   2. If not found, look for an 'all' record for the channel.
 *   3. If neither found, fall back to the provided `defaultOptIn` parameter
 *      (default: true — assume opted in if never recorded).
 *
 * This mirrors common ESP behaviour: silence = opted in (for systems that
 * import contacts without explicit opt-in records).
 */

/**
 * Retrieve all preference documents for a customer.
 *
 * @param {string|ObjectId} customerId
 * @returns {Promise<Array>}
 */
async function getPreferences(customerId) {
  if (!customerId) throw new Error('customerId is required');
  return CommunicationPreference.find({ customerId }).lean();
}

/**
 * Determine whether a customer is opted in for a specific channel + messageType.
 *
 * @param {string|ObjectId} customerId
 * @param {string} channel      One of: email, whatsapp, sms, push
 * @param {string} messageType  One of: marketing, transactional
 * @param {boolean} [defaultOptIn=true]  Fallback when no preference record exists
 * @returns {Promise<boolean>}
 */
async function isOptedIn(customerId, channel, messageType, defaultOptIn = true) {
  if (!customerId || !channel || !messageType) {
    throw new Error('customerId, channel, and messageType are required');
  }

  // 1. Look for an exact match
  const specific = await CommunicationPreference.findOne({
    customerId,
    channel,
    messageType,
  }).lean();

  if (specific) {
    return specific.optedIn;
  }

  // 2. Fall back to an 'all' record for this channel
  const allRecord = await CommunicationPreference.findOne({
    customerId,
    channel,
    messageType: 'all',
  }).lean();

  if (allRecord) {
    return allRecord.optedIn;
  }

  // 3. No record found → use the caller's default
  return defaultOptIn;
}

/**
 * Opt a customer out of a specific channel + messageType combination.
 * Creates the record if it doesn't exist (upsert).
 *
 * @param {string|ObjectId} customerId
 * @param {string} channel
 * @param {string} messageType
 * @param {string} [source='system']
 * @param {string} [reason=null]
 * @returns {Promise<Object>}  Updated preference document
 */
async function optOut(customerId, channel, messageType, source = 'system', reason = null) {
  if (!customerId || !channel || !messageType) {
    throw new Error('customerId, channel, and messageType are required');
  }

  return CommunicationPreference.findOneAndUpdate(
    { customerId, channel, messageType },
    {
      $set: {
        optedIn: false,
        optedOutAt: new Date(),
        optedInAt: null,
        source,
        reason: reason || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Opt a customer back in to a specific channel + messageType combination.
 *
 * @param {string|ObjectId} customerId
 * @param {string} channel
 * @param {string} messageType
 * @param {string} [source='system']
 * @returns {Promise<Object>}  Updated preference document
 */
async function optIn(customerId, channel, messageType, source = 'system') {
  if (!customerId || !channel || !messageType) {
    throw new Error('customerId, channel, and messageType are required');
  }

  return CommunicationPreference.findOneAndUpdate(
    { customerId, channel, messageType },
    {
      $set: {
        optedIn: true,
        optedInAt: new Date(),
        optedOutAt: null,
        source,
        reason: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Opt out multiple customers from a channel at once.
 * Used when processing bulk unsubscribe events from providers.
 *
 * @param {Array<string|ObjectId>} customerIds
 * @param {string} channel
 * @param {string} messageType
 * @param {string} [source='webhook']
 * @param {string} [reason=null]
 * @returns {Promise<{ modifiedCount: number }>}
 */
async function bulkOptOut(customerIds, channel, messageType, source = 'webhook', reason = null) {
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    throw new Error('customerIds must be a non-empty array');
  }
  if (!channel || !messageType) {
    throw new Error('channel and messageType are required');
  }

  const now = new Date();
  const ops = customerIds.map(customerId => ({
    updateOne: {
      filter: { customerId, channel, messageType },
      update: {
        $set: {
          optedIn: false,
          optedOutAt: now,
          optedInAt: null,
          source,
          reason: reason || null,
        },
      },
      upsert: true,
    },
  }));

  const result = await CommunicationPreference.bulkWrite(ops);
  return { modifiedCount: result.modifiedCount + result.upsertedCount };
}

module.exports = {
  getPreferences,
  isOptedIn,
  optOut,
  optIn,
  bulkOptOut,
};
