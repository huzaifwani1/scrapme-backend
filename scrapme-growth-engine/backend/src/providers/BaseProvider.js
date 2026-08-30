'use strict';

/**
 * BaseProvider — Abstract interface for all messaging channel providers.
 *
 * Every concrete provider (email, WhatsApp, SMS, push) MUST extend this class
 * and implement all methods below. The Automation Engine and dispatch service
 * depend ONLY on this interface — never on a concrete provider directly.
 *
 * Phase 5: The only active implementation is NullProvider.
 * All other providers are stubs that throw ProviderNotEnabledError.
 */
class BaseProvider {
  /**
   * @param {string} name  Human-readable provider name (e.g. 'sendgrid', 'null')
   * @param {string} channel  One of: 'email', 'whatsapp', 'sms', 'push'
   */
  constructor(name, channel) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }
    this.name = name;
    this.channel = channel;
  }

  /**
   * Send a message intent through this provider.
   *
   * @param {Object} intent  The MessageIntent document (or equivalent plain object)
   * @param {string} intent.recipient   Destination address / phone / token
   * @param {string} intent.renderedSubject  (Email only) Rendered subject line
   * @param {string} intent.renderedBody     Rendered message body
   * @param {Object} [intent.channelMeta]   Channel-specific metadata from template
   * @returns {Promise<{ providerMessageId: string|null, status: string, raw: Object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async send(intent) {
    throw new Error(`${this.constructor.name} must implement send()`);
  }

  /**
   * Fetch current delivery status from the provider for a given message.
   * Not all providers support polling; implementations may return null.
   *
   * @param {string} providerMessageId
   * @returns {Promise<{ status: string, raw: Object }|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async getDeliveryStatus(providerMessageId) {
    throw new Error(`${this.constructor.name} must implement getDeliveryStatus()`);
  }

  /**
   * Validate an incoming webhook request's authenticity.
   * Must be called BEFORE the body is trusted.
   *
   * @param {import('express').Request} req  Raw Express request object
   * @returns {boolean}  true if the signature is valid
   */
  // eslint-disable-next-line no-unused-vars
  validateWebhookSignature(req) {
    throw new Error(`${this.constructor.name} must implement validateWebhookSignature()`);
  }

  /**
   * Parse a validated webhook request body into a normalized event object.
   *
   * @param {import('express').Request} req
   * @returns {{ eventType: string, providerMessageId: string|null, raw: Object }}
   *   eventType is one of: 'delivered','bounced','opened','clicked','failed',
   *   'unsubscribed','spam_report','deferred'
   */
  // eslint-disable-next-line no-unused-vars
  parseWebhookEvent(req) {
    throw new Error(`${this.constructor.name} must implement parseWebhookEvent()`);
  }
}

/**
 * Thrown by stub providers when they are invoked without the required
 * live-mode configuration. Distinct from generic Error so tests can assert
 * the exact failure type.
 */
class ProviderNotEnabledError extends Error {
  constructor(providerName) {
    super(
      `${providerName} provider is not enabled. ` +
      'Set the provider credentials and MESSAGING_LIVE_MODE=true to activate live sending.'
    );
    this.name = 'ProviderNotEnabledError';
    this.code = 'PROVIDER_NOT_ENABLED';
  }
}

module.exports = { BaseProvider, ProviderNotEnabledError };
