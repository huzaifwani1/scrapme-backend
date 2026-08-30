const AutomationExecution = require('../models/AutomationExecution');
const preferenceService = require('./preferenceService');

/**
 * Evaluates automation-level suppression rules (e.g. duplicate check, active check, customer existence).
 * @param {Object} params
 * @param {Object} params.automation
 * @param {Object} params.customer
 * @param {string|ObjectId} params.triggerEventId
 * @returns {Promise<{ suppressed: boolean, reason?: string }>}
 */
async function evaluateAutomationSuppression({ automation, customer, triggerEventId }) {
  if (!customer) {
    return { suppressed: true, reason: 'missing_customer' };
  }

  if (!automation) {
    return { suppressed: true, reason: 'missing_automation' };
  }

  if (automation.status !== 'active') {
    return { suppressed: true, reason: `automation_not_active (status: ${automation.status})` };
  }

  if (triggerEventId) {
    const duplicate = await AutomationExecution.findOne({
      automationId: automation._id,
      customerId: customer._id,
      triggerEventId
    });
    if (duplicate) {
      return { suppressed: true, reason: 'duplicate_execution' };
    }
  }

  return { suppressed: false };
}

/**
 * Evaluates action-level suppression rules (e.g. unsubscribed, missing recipients).
 * @param {Object} params
 * @param {Object} params.customer
 * @param {Object} params.action
 * @returns {{ suppressed: boolean, reason?: string }}
 */
function evaluateActionSuppression({ customer, action }) {
  if (!customer) {
    return { suppressed: true, reason: 'missing_customer' };
  }

  if (action && action.type === 'send_message') {
    const channel = (action.channel || '').toLowerCase();

    // Check unsubscribed suppression
    if (customer.unsubscribed === true) {
      return { suppressed: true, reason: 'unsubscribed' };
    }

    // Check channel recipient presence
    if (channel === 'email') {
      if (!customer.email || customer.email.trim() === '') {
        return { suppressed: true, reason: 'missing_recipient_email' };
      }
    } else if (channel === 'sms' || channel === 'whatsapp') {
      if (!customer.phone || customer.phone.trim() === '') {
        return { suppressed: true, reason: 'missing_recipient_phone' };
      }
    } else if (channel === 'push') {
      if (!customer.scrapmeUserId) {
        return { suppressed: true, reason: 'missing_recipient_push' };
      }
    } else {
      return { suppressed: true, reason: `unsupported_channel (${channel})` };
    }
  }

  return { suppressed: false };
}

/**
 * Phase 5 extension: evaluates action-level suppression with full preference checking.
 * Async because it queries the CommunicationPreference collection.
 *
 * Suppression order:
 *   1. Legacy customer.unsubscribed flag (backward compat)
 *   2. CommunicationPreference record (channel + messageType)
 *   3. Missing recipient check
 *
 * @param {Object} params
 * @param {Object} params.customer
 * @param {Object} params.action
 * @param {string} [params.messageType='marketing']  The message type to check preferences for
 * @returns {Promise<{ suppressed: boolean, reason?: string }>}
 */
async function evaluateActionSuppressionWithPreferences({ customer, action, messageType = 'marketing' }) {
  if (!customer) {
    return { suppressed: true, reason: 'missing_customer' };
  }

  if (action && action.type === 'send_message') {
    const channel = (action.channel || '').toLowerCase();

    // 1. Legacy backward-compat: customer.unsubscribed flag
    if (customer.unsubscribed === true) {
      return { suppressed: true, reason: 'unsubscribed' };
    }

    // 2. Check CommunicationPreference record if customer has a DB id
    const customerId = customer._id || customer.id;
    if (customerId) {
      const optedIn = await preferenceService.isOptedIn(customerId, channel, messageType);
      if (!optedIn) {
        return { suppressed: true, reason: `opted_out (channel: ${channel}, type: ${messageType})` };
      }
    }

    // 3. Channel recipient presence
    if (channel === 'email') {
      if (!customer.email || customer.email.trim() === '') {
        return { suppressed: true, reason: 'missing_recipient_email' };
      }
    } else if (channel === 'sms' || channel === 'whatsapp') {
      if (!customer.phone || customer.phone.trim() === '') {
        return { suppressed: true, reason: 'missing_recipient_phone' };
      }
    } else if (channel === 'push') {
      if (!customer.scrapmeUserId) {
        return { suppressed: true, reason: 'missing_recipient_push' };
      }
    } else {
      return { suppressed: true, reason: `unsupported_channel (${channel})` };
    }
  }

  return { suppressed: false };
}

module.exports = {
  evaluateAutomationSuppression,
  evaluateActionSuppression,
  evaluateActionSuppressionWithPreferences,
};
