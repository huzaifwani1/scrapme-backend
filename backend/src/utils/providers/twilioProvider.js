const fetch = require('node-fetch').default || global.fetch || require('node-fetch');

class TwilioProvider {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromPhone = process.env.TWILIO_FROM_PHONE;
    
    this.enabled = !!(this.accountSid && this.authToken && this.fromPhone);
    
    if (this.enabled) {
      console.log('✅ Twilio SMS provider is active');
    } else {
      console.log('ℹ️ Twilio credentials missing. Running Twilio in TEST mode.');
    }
  }

  async sendSMS(toPhone, body) {
    if (!toPhone) return { success: false, error: 'Phone number is required' };

    let formattedPhone = toPhone.trim();
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.length === 10) {
        formattedPhone = `+91${formattedPhone}`;
      } else {
        formattedPhone = `+${formattedPhone}`;
      }
    }

    if (!this.enabled) {
      console.log('\n💬 ====== [TEST MODE TWILIO SMS PREVIEW] ======');
      console.log(`To:      ${formattedPhone}`);
      console.log(`Body:    ${body}`);
      console.log('==============================================\n');
      return { success: true, requestId: `TEST-TWILIO-${Date.now()}` };
    }

    const maxRetries = 3;
    let attempt = 0;
    
    const cleanBody = process.env.NODE_ENV === 'production' 
      ? body.replace(/\b\d{6}\b/g, '******') 
      : body;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
        const authHeader = 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
        
        const formData = new URLSearchParams();
        formData.append('From', this.fromPhone);
        formData.append('To', formattedPhone);
        formData.append('Body', body);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString(),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const responseData = await response.json();

        if (!response.ok) {
          console.error(`❌ Twilio REST API error (Attempt ${attempt + 1}/${maxRetries + 1}):`, responseData.message || response.statusText);
          throw new Error(responseData.message || response.statusText);
        }

        console.log(`✅ SMS delivered successfully via Twilio (SID: ${responseData.sid})`);
        return { success: true, requestId: responseData.sid };
      } catch (error) {
        clearTimeout(timeoutId);
        attempt++;
        const isTimeout = error.name === 'AbortError';
        console.warn(`⚠️ Twilio attempt ${attempt} failed: ${isTimeout ? 'Request Timed Out (5s)' : error.message}.`);
        
        if (attempt <= maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          console.log(`🔄 Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ SMS Dispatch failed after ${maxRetries + 1} attempts for: ${formattedPhone}`);
          return { success: false, error: error.message };
        }
      }
    }
    return { success: false, error: 'Unknown dispatch error' };
  }

  async sendOTP(toPhone, otp) {
    const body = `ScrapMe: Your verification code for pickup order is ${otp}. This code is valid for 10 minutes.`;
    return this.sendSMS(toPhone, body);
  }
}

module.exports = TwilioProvider;
