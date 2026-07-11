const TwilioProvider = require('./providers/twilioProvider');
const Msg91Provider = require('./providers/msg91Provider');

class SmsService {
  constructor() {
    const providerEnv = (process.env.SMS_PROVIDER || '').toLowerCase().trim();

    if (providerEnv === 'twilio') {
      this.provider = new TwilioProvider();
    } else if (providerEnv === 'msg91') {
      this.provider = new Msg91Provider();
    } else {
      // Auto-detect based on credential keys
      const msg91Active = !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
      const twilioActive = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_PHONE);

      if (msg91Active) {
        this.provider = new Msg91Provider();
      } else if (twilioActive) {
        this.provider = new TwilioProvider();
      } else {
        // Default fallback to MSG91 provider in TEST mode
        this.provider = new Msg91Provider();
      }
    }

    this.enabled = this.provider.enabled;
  }

  async sendSMS(toPhone, body) {
    return this.provider.sendSMS(toPhone, body);
  }

  async sendOTP(toPhone, otp) {
    return this.provider.sendOTP(toPhone, otp);
  }
}

const smsService = new SmsService();
module.exports = smsService;
