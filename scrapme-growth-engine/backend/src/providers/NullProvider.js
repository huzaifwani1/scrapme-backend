'use strict';

const { BaseProvider } = require('./BaseProvider');

/**
 * NullProvider — The default stub provider used in all dry-run and Phase 5 environments.
 *
 * - Never makes network calls
 * - Never instantiates any external SDK
 * - Returns predictable dry-run responses for all operations
 * - Used by providerRegistry whenever DRY_RUN=true or MESSAGING_LIVE_MODE is not 'true'
 *
 * This is the ONLY provider active during Phase 5.
 */
class NullProvider extends BaseProvider {
  constructor() {
    super('null', 'all');
  }

  /**
   * Simulates a send without any external call.
   * @returns {{ providerMessageId: null, status: 'dry_run_suppressed', raw: Object }}
   */
  async send(intent) {
    return {
      providerMessageId: null,
      status: 'dry_run_suppressed',
      raw: {
        provider: 'null',
        channel: intent && intent.channel ? intent.channel : 'unknown',
        recipient: intent && intent.recipient ? '[redacted]' : null,
        message: 'Message suppressed by NullProvider (dry-run mode active)',
      },
    };
  }

  /**
   * NullProvider has no delivery status to report.
   */
  async getDeliveryStatus(_providerMessageId) {
    return {
      status: 'dry_run_suppressed',
      raw: { provider: 'null', message: 'No status available in dry-run mode' },
    };
  }

  /**
   * NullProvider accepts no real webhooks.
   * validateWebhookSignature always returns false so webhook routes return 501.
   */
  validateWebhookSignature(_req) {
    return false;
  }

  /**
   * NullProvider cannot parse real webhook payloads.
   */
  parseWebhookEvent(_req) {
    return {
      eventType: null,
      providerMessageId: null,
      raw: {},
    };
  }
}

module.exports = NullProvider;
