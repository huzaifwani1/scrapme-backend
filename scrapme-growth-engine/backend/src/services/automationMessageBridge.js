'use strict';

const messageDispatchService = require('./messageDispatchService');

/**
 * automationMessageBridge — Connects AutomationExecution results to the messaging pipeline.
 *
 * This is the ONLY connection point between the Automation Engine (Phase 4)
 * and the Communication Layer (Phase 5). It:
 *
 *   1. Reads `actionResults` from a completed AutomationExecution
 *   2. Filters for `send_message` actions
 *   3. Creates a MessageIntent for each action via messageDispatchService
 *   4. Returns a summary (never throws on intent creation failure — failures are logged)
 *
 * CRITICAL INVARIANTS:
 *   - automationService.js does NOT import this file
 *   - This bridge is called AFTER the execution record is saved, not during evaluation
 *   - In Phase 5, execution.metadata.dryRun is always true, so the bridge
 *     short-circuits and creates zero real MessageIntent records
 *   - The Automation Engine's dry-run behaviour is completely preserved
 *
 * Phase 6 activation:
 *   - Set DRY_RUN=false and MESSAGING_LIVE_MODE=true
 *   - Call bridgeExecutionToIntents() from the execution controller or queue worker
 */

/**
 * Convert the send_message actionResults from an AutomationExecution into MessageIntents.
 *
 * @param {Object} params
 * @param {Object} params.execution   AutomationExecution document
 * @param {Object} params.customer    Customer document
 * @param {Object} params.automation  Automation document
 * @returns {Promise<{ intentsCreated: number, dryRun: boolean, intents: Object[], errors: Object[] }>}
 */
async function bridgeExecutionToIntents({ execution, customer, automation }) {
  if (!execution) throw new Error('execution is required');
  if (!customer) throw new Error('customer is required');
  if (!automation) throw new Error('automation is required');

  // ── Phase 5 dry-run short-circuit ─────────────────────────────────────────
  // execution.metadata.dryRun is stamped at execution creation time.
  // Also check the global DRY_RUN env var as a belt-and-suspenders guard.
  const isDryRun = (execution.metadata && execution.metadata.dryRun === true)
    || process.env.DRY_RUN !== 'false';

  if (isDryRun) {
    const sendMessageCount = Array.isArray(execution.actionResults)
      ? execution.actionResults.filter(a => a.type === 'send_message').length
      : 0;
    console.log(
      `[automationMessageBridge] Dry-run mode: ${sendMessageCount} send_message action(s) ` +
      `skipped for execution ${execution._id}. No MessageIntents created.`
    );
    return { intentsCreated: 0, dryRun: true, intents: [], errors: [] };
  }

  // ── Live mode: create intents for each send_message action ────────────────
  const intents = [];
  const errors = [];

  const actionResults = Array.isArray(execution.actionResults) ? execution.actionResults : [];

  for (const [i, action] of actionResults.entries()) {
    if (action.type !== 'send_message') continue;

    const templateSlug = action.templateId || action.templateSlug || '';
    if (!templateSlug) {
      errors.push({ actionIndex: i, reason: 'missing_template_slug' });
      continue;
    }

    if (!action.recipient) {
      errors.push({ actionIndex: i, reason: 'missing_recipient', channel: action.channel });
      continue;
    }

    const idempotencyKey = `exec:${execution._id}:action:${i}`;

    try {
      const intent = await messageDispatchService.createIntent({
        customerId: customer._id,
        automationId: automation._id,
        executionId: execution._id,
        channel: action.channel,
        messageType: action.messageType || 'marketing',
        templateSlug,
        templateVariables: action.templateVariables || {},
        recipient: action.recipient,
        idempotencyKey,
        metadata: {
          automationName: automation.name,
          actionIndex: i,
        },
      });
      intents.push({ intentId: intent._id, status: intent.status, channel: action.channel });
    } catch (err) {
      console.error(`[automationMessageBridge] Failed to create intent for action ${i}:`, err.message);
      errors.push({ actionIndex: i, reason: err.message, channel: action.channel });
    }
  }

  return {
    intentsCreated: intents.length,
    dryRun: false,
    intents,
    errors,
  };
}

module.exports = { bridgeExecutionToIntents };
