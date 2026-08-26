const CustomerSegment = require('../models/CustomerSegment');
const AutomationExecution = require('../models/AutomationExecution');
const conditionEvaluator = require('./conditionEvaluator');
const suppressionService = require('./suppressionService');

/**
 * Prepares the customer object by appending virtual segment keys.
 * @param {Object} customer
 * @returns {Promise<Object>} prepared customer object
 */
async function prepareCustomerForEvaluation(customer) {
  if (!customer) return null;
  const segments = await CustomerSegment.find({ customerId: customer._id }).lean();
  const segmentKeys = segments.map(s => s.segmentKey);
  const customerObj = customer.toObject ? customer.toObject() : { ...customer };
  customerObj.segments = segmentKeys;
  return customerObj;
}

/**
 * Evaluates an automation against a customer and event without writing to DB.
 * @param {Object} params
 * @param {Object} params.automation
 * @param {Object} params.customer
 * @param {Object} params.event
 * @returns {Promise<{ eligible: boolean, skipReason?: string, actionResults?: Array }>}
 */
async function evaluateAutomation({ automation, customer, event }) {
  if (!customer) {
    return { eligible: false, skipReason: 'missing_customer' };
  }
  if (!automation) {
    return { eligible: false, skipReason: 'missing_automation' };
  }

  // 1. Check automation status
  if (automation.status !== 'active') {
    return { eligible: false, skipReason: `automation_not_active (status: ${automation.status})` };
  }

  // 2. Prepare customer (fetch segments)
  const preparedCustomer = await prepareCustomerForEvaluation(customer);

  // 3. Evaluate conditions
  const conditionsPass = conditionEvaluator.evaluateConditions(preparedCustomer, automation.conditions);
  if (!conditionsPass) {
    return { eligible: false, skipReason: 'conditions_not_met' };
  }

  // 4. Evaluate automation-level suppression (duplicate check excluded here as this is a stateless evaluation)
  if (customer.unsubscribed === true) {
    // If any send_message actions exist, suppress
    const hasSendMessage = automation.actions.some(a => a.type === 'send_message');
    if (hasSendMessage) {
      return { eligible: false, skipReason: 'unsubscribed' };
    }
  }

  // 5. Evaluate actions
  const actionResults = [];
  for (const action of automation.actions) {
    const suppression = suppressionService.evaluateActionSuppression({ customer: preparedCustomer, action });
    if (suppression.suppressed) {
      return { eligible: false, skipReason: suppression.reason };
    }

    // Generate mock actions
    if (action.type === 'send_message') {
      const channel = (action.channel || '').toLowerCase();
      const recipient = channel === 'email' ? preparedCustomer.email : preparedCustomer.phone;
      actionResults.push({
        type: 'send_message',
        channel,
        recipient: recipient || '',
        templateId: action.templateId || '',
        status: 'queued_for_future_execution'
      });
    } else if (action.type === 'add_tag') {
      const tag = action.config && action.config.tag;
      actionResults.push({
        type: 'add_tag',
        tag: tag || '',
        status: 'queued_for_future_execution'
      });
    } else if (action.type === 'remove_tag') {
      const tag = action.config && action.config.tag;
      actionResults.push({
        type: 'remove_tag',
        tag: tag || '',
        status: 'queued_for_future_execution'
      });
    } else {
      actionResults.push({
        type: action.type,
        config: action.config,
        status: 'queued_for_future_execution'
      });
    }
  }

  return { eligible: true, actionResults };
}

/**
 * Orchestrates automation execution and writes AutomationExecution record.
 * @param {Object} params
 * @param {Object} params.automation
 * @param {Object} params.customer
 * @param {Object} params.event
 * @param {boolean} params.ignoreDelay (if true, executes immediately)
 * @param {Date} params.now
 * @returns {Promise<Object>} The AutomationExecution document
 */
async function executeAutomation({ automation, customer, event, ignoreDelay = false, now = new Date() }) {
  if (!customer) throw new Error('Customer required for execution');
  if (!automation) throw new Error('Automation required for execution');

  const triggerEventId = event ? event._id : null;

  // 1. Enforce idempotency (duplicate-execution suppression check)
  if (triggerEventId) {
    const existing = await AutomationExecution.findOne({
      automationId: automation._id,
      customerId: customer._id,
      triggerEventId
    });
    if (existing) {
      // Return existing execution record, no new execution created
      return existing;
    }
  }

  const delayMinutes = automation.trigger.delayMinutes || 0;
  const triggerTime = event && event.timestamp ? new Date(event.timestamp) : now;
  const scheduledFor = new Date(triggerTime.getTime() + delayMinutes * 60000);

  // 2. Handle delayed execution: schedule as 'pending'
  if (delayMinutes > 0 && !ignoreDelay) {
    return await AutomationExecution.create({
      automationId: automation._id,
      customerId: customer._id,
      triggerEventId,
      status: 'pending',
      scheduledFor,
      metadata: { dryRun: process.env.DRY_RUN !== 'false' }
    });
  }

  // 3. Immediate evaluation (or executing a scheduled task)
  const evalResult = await evaluateAutomation({ automation, customer, event });

  const status = evalResult.eligible ? 'completed' : 'skipped';
  const skipReason = evalResult.skipReason || '';
  const actionResults = evalResult.actionResults || [];

  return await AutomationExecution.create({
    automationId: automation._id,
    customerId: customer._id,
    triggerEventId,
    status,
    scheduledFor,
    executedAt: now,
    actionResults,
    skipReason,
    metadata: { dryRun: process.env.DRY_RUN !== 'false' }
  });
}

module.exports = {
  prepareCustomerForEvaluation,
  evaluateAutomation,
  executeAutomation
};
