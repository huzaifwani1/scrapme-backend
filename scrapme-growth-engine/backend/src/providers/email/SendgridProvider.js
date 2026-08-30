'use strict';

const { BaseProvider, ProviderNotEnabledError } = require('../BaseProvider');

/**
 * SendgridProvider — Email delivery via SendGrid.
 *
 * Phase 5 STATUS: STUB ONLY.
 * - No @sendgrid/mail SDK is imported.
 * - No network calls are made.
 * - All methods throw ProviderNotEnabledError.
 *
 * To activate in Phase 6:
 *   1. npm install @sendgrid/mail
 *   2. Set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_WEBHOOK_SECRET
 *   3. Set MESSAGING_LIVE_MODE=true and DRY_RUN=false
 *   4. Implement the methods below
 *   5. Register in providerRegistry.js
 */
class SendgridProvider extends BaseProvider {
  constructor() {
    super('sendgrid', 'email');
  }

  async send(_intent) {
    throw new ProviderNotEnabledError('SendGrid');
  }

  async getDeliveryStatus(_providerMessageId) {
    throw new ProviderNotEnabledError('SendGrid');
  }

  validateWebhookSignature(_req) {
    throw new ProviderNotEnabledError('SendGrid');
  }

  parseWebhookEvent(_req) {
    throw new ProviderNotEnabledError('SendGrid');
  }
}

module.exports = SendgridProvider;
