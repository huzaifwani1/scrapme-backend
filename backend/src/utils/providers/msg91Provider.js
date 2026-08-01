const fetch = require('node-fetch').default || global.fetch || require('node-fetch');

class Msg91Provider {
  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY;
    this.templateId = process.env.MSG91_TEMPLATE_ID;
    this.senderId = process.env.MSG91_SENDER_ID || 'SCRPMG';
    this.flowTemplateId = process.env.MSG91_FLOW_TEMPLATE_ID;

    this.enabled = !!(this.authKey && this.templateId);

    if (this.enabled) {
      console.log('✅ MSG91 SMS provider is active');
    } else {
      console.log('ℹ️ MSG91 credentials missing. Running MSG91 in TEST mode.');
    }
  }

  /**
   * Send transactional SMS alert using MSG91 Flow API
   * POST https://control.msg91.com/api/v5/flow
   */
  async sendSMS(toPhone, body) {
    if (!toPhone) return { success: false, error: 'Phone number is required' };

    let formattedPhone = toPhone.trim();
    if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.replace('+', '');
    } else if (formattedPhone.length === 10) {
      formattedPhone = `91${formattedPhone}`;
    }

    if (!this.enabled || !this.flowTemplateId) {
      console.log('\n💬 ====== [TEST MODE MSG91 FLOW SMS PREVIEW] ======');
      console.log(`To:      ${formattedPhone}`);
      console.log(`Body:    ${body}`);
      console.log('==================================================\n');
      return { success: true, requestId: `TEST-MSG91-FLOW-${Date.now()}` };
    }

    const maxRetries = 3;
    let attempt = 0;

    const url = 'https://control.msg91.com/api/v5/flow';

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'authkey': this.authKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            template_id: this.flowTemplateId,
            sender: this.senderId,
            recipients: [
              {
                mobiles: formattedPhone,
                message: body // Maps standard body variable
              }
            ]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const responseData = await response.json();

        if (!response.ok || (responseData && responseData.type === 'error')) {
          const errMsg = responseData.message || response.statusText || 'Unknown error';
          console.error(`❌ MSG91 Flow API error (Attempt ${attempt + 1}/${maxRetries + 1}):`, errMsg);
          throw new Error(errMsg);
        }

        console.log(`✅ Transactional SMS sent successfully via MSG91 (Request ID: ${responseData.request_id || 'N/A'})`);
        return { success: true, requestId: responseData.request_id || 'N/A' };
      } catch (error) {
        clearTimeout(timeoutId);
        attempt++;
        const isTimeout = error.name === 'AbortError';
        console.warn(`⚠️ MSG91 Flow attempt ${attempt} failed: ${isTimeout ? 'Request Timed Out (5s)' : error.message}.`);

        if (attempt <= maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          console.log(`🔄 Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ MSG91 Flow SMS dispatch failed after ${maxRetries + 1} attempts for: ${formattedPhone}`);
          return { success: false, error: error.message };
        }
      }
    }
    return { success: false, error: 'Unknown dispatch error' };
  }
}

module.exports = Msg91Provider;
