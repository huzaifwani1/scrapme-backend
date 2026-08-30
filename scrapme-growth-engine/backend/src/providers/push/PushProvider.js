'use strict';

const { BaseProvider, ProviderNotEnabledError } = require('../BaseProvider');

/**
 * PushProvider — Push notification delivery.
 *
 * Phase 5 STATUS: STUB ONLY.
 * - No push SDK (FCM, APNs, etc.) is imported.
 * - No network calls are made.
 * - All methods throw ProviderNotEnabledError.
 *
 * To activate in Phase 6:
 *   1. Choose and install a push SDK (e.g. firebase-admin)
 *   2. Set the relevant push credentials
 *   3. Set MESSAGING_LIVE_MODE=true and DRY_RUN=false
 *   4. Implement the methods below
 *   5. Register in providerRegistry.js
 */
class PushProvider extends BaseProvider {
  constructor() {
    super('fcm', 'push');
  }

  async send(_intent) {
    throw new ProviderNotEnabledError('Push');
  }

  async getDeliveryStatus(_providerMessageId) {
    throw new ProviderNotEnabledError('Push');
  }

  validateWebhookSignature(_req) {
    throw new ProviderNotEnabledError('Push');
  }

  parseWebhookEvent(_req) {
    throw new ProviderNotEnabledError('Push');
  }
}

module.exports = PushProvider;
