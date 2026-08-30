'use strict';

const NullProvider = require('./NullProvider');

/**
 * providerRegistry — The single chokepoint for provider resolution.
 *
 * Rules (enforced in order):
 *   1. If DRY_RUN !== 'false'          → always return NullProvider
 *   2. If MESSAGING_LIVE_MODE !== 'true' → always return NullProvider
 *   3. Both gates must be explicitly cleared before any live provider is returned.
 *
 * Phase 5: No live providers are registered. getProvider() always returns NullProvider.
 *
 * Phase 6 integration:
 *   - Import concrete providers here
 *   - Add credential checks
 *   - Return the appropriate live provider for each channel
 */

const SUPPORTED_CHANNELS = ['email', 'whatsapp', 'sms', 'push'];

/**
 * Returns the appropriate provider instance for the given channel.
 *
 * @param {string} channel  One of: 'email', 'whatsapp', 'sms', 'push'
 * @returns {import('./BaseProvider').BaseProvider}
 * @throws {Error} if channel is not supported
 */
function getProvider(channel) {
  if (!SUPPORTED_CHANNELS.includes(channel)) {
    throw new Error(`Unsupported messaging channel: "${channel}". ` +
      `Supported channels: ${SUPPORTED_CHANNELS.join(', ')}`);
  }

  // ── Safety Gate 1: Dry-Run ────────────────────────────────────────────────
  // DRY_RUN defaults to 'true'. Both gates must be explicitly unlocked.
  if (process.env.DRY_RUN !== 'false') {
    return new NullProvider();
  }

  // ── Safety Gate 2: Live Mode ──────────────────────────────────────────────
  // MESSAGING_LIVE_MODE must also be explicitly set to 'true'.
  if (process.env.MESSAGING_LIVE_MODE !== 'true') {
    return new NullProvider();
  }

  // ── Phase 6+: Live Provider Resolution ────────────────────────────────────
  // Both safety gates have been cleared. Resolve the live provider.
  //
  // Uncomment and complete in Phase 6:
  //
  // switch (channel) {
  //   case 'email': {
  //     if (!process.env.SENDGRID_API_KEY) {
  //       throw new Error('SENDGRID_API_KEY is required for live email sending');
  //     }
  //     const SendgridProvider = require('./email/SendgridProvider');
  //     return new SendgridProvider();
  //   }
  //   case 'whatsapp': {
  //     if (!process.env.WHATSAPP_API_TOKEN) {
  //       throw new Error('WHATSAPP_API_TOKEN is required for live WhatsApp sending');
  //     }
  //     const WhatsAppProvider = require('./whatsapp/WhatsAppProvider');
  //     return new WhatsAppProvider();
  //   }
  //   case 'sms': {
  //     if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  //       throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required for live SMS sending');
  //     }
  //     const SmsProvider = require('./sms/SmsProvider');
  //     return new SmsProvider();
  //   }
  //   case 'push': {
  //     const PushProvider = require('./push/PushProvider');
  //     return new PushProvider();
  //   }
  // }

  // Phase 5: Even if both gates are cleared, no live provider is implemented yet.
  // Return NullProvider with a warning log.
  console.warn(
    `[Growth Engine] providerRegistry: MESSAGING_LIVE_MODE=true but no live provider ` +
    `is implemented for channel "${channel}" in Phase 5. Falling back to NullProvider.`
  );
  return new NullProvider();
}

/**
 * Returns the NullProvider directly, bypassing all gate checks.
 * Used in tests that need to verify NullProvider behavior explicitly.
 */
function getNullProvider() {
  return new NullProvider();
}

module.exports = { getProvider, getNullProvider, SUPPORTED_CHANNELS };
