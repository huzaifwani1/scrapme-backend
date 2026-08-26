const AutomationExecution = require('../models/AutomationExecution');

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

module.exports = {
  evaluateAutomationSuppression,
  evaluateActionSuppression
};
