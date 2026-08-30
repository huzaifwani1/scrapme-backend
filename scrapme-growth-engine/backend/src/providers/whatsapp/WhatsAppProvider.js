'use strict';

const { BaseProvider, ProviderNotEnabledError } = require('../BaseProvider');

/**
 * WhatsAppProvider — WhatsApp Business Cloud API delivery.
 *
 * Phase 5 STATUS: STUB ONLY.
 * - No WhatsApp SDK is imported.
 * - No network calls are made.
 * - All methods throw ProviderNotEnabledError.
 *
 * To activate in Phase 6:
 *   1. Set WHATSAPP_API_TOKEN, WHATSAPP_WEBHOOK_VERIFY_TOKEN
 *   2. Set MESSAGING_LIVE_MODE=true and DRY_RUN=false
 *   3. Implement the methods below using the Meta Cloud API
 *   4. Register in providerRegistry.js
 */
class WhatsAppProvider extends BaseProvider {
  constructor() {
    super('whatsapp_cloud', 'whatsapp');
  }

  async send(_intent) {
    throw new ProviderNotEnabledError('WhatsApp');
  }

  async getDeliveryStatus(_providerMessageId) {
    throw new ProviderNotEnabledError('WhatsApp');
  }

  validateWebhookSignature(_req) {
    throw new ProviderNotEnabledError('WhatsApp');
  }

  parseWebhookEvent(_req) {
    throw new ProviderNotEnabledError('WhatsApp');
  }
}

module.exports = WhatsAppProvider;
