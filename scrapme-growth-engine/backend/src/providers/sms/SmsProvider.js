'use strict';

const { BaseProvider, ProviderNotEnabledError } = require('../BaseProvider');

/**
 * SmsProvider — SMS delivery (e.g. Twilio, MSG91).
 *
 * Phase 5 STATUS: STUB ONLY.
 * - No SMS SDK is imported.
 * - No network calls are made.
 * - All methods throw ProviderNotEnabledError.
 *
 * To activate in Phase 6:
 *   1. Choose and install an SMS SDK (e.g. twilio)
 *   2. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   3. Set MESSAGING_LIVE_MODE=true and DRY_RUN=false
 *   4. Implement the methods below
 *   5. Register in providerRegistry.js
 */
class SmsProvider extends BaseProvider {
  constructor() {
    super('twilio_sms', 'sms');
  }

  async send(_intent) {
    throw new ProviderNotEnabledError('SMS');
  }

  async getDeliveryStatus(_providerMessageId) {
    throw new ProviderNotEnabledError('SMS');
  }

  validateWebhookSignature(_req) {
    throw new ProviderNotEnabledError('SMS');
  }

  parseWebhookEvent(_req) {
    throw new ProviderNotEnabledError('SMS');
  }
}

module.exports = SmsProvider;
