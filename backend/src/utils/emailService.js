const nodemailer = require('nodemailer');

/**
 * Email service for sending password reset codes and notifications
 */
class EmailService {
  constructor() {
    this.enabled = process.env.EMAIL_ENABLED === 'true';
    this.transporter = null;

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_PORT === '465',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ Email transporter verification failed:', error);
          this.enabled = false;
        } else {
          console.log('✅ Email service is ready to send messages');
        }
      });
    } else {
      console.log('ℹ️ Email service is disabled (EMAIL_ENABLED=false). Reset codes will be logged to console.');
    }
  }

  /**
   * Send password reset email
   * @param {string} to - Recipient email
   * @param {string} resetCode - 6-digit reset code
   * @param {string} userName - User's name
   * @returns {Promise<boolean>} - Success status
   */
  async sendPasswordResetEmail(to, resetCode, userName = 'User') {
    const subject = 'Scrapme - Password Reset Code';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #667eea; text-align: center; margin: 20px 0; padding: 15px; background: white; border-radius: 8px; border: 2px dashed #667eea; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; text-align: center; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Scrapme</h1>
            <p>Password Reset Request</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>You have requested to reset your password for your Scrapme account.</p>
            <p>Please use the following 6-digit verification code to reset your password:</p>
            
            <div class="code">${resetCode}</div>
            
            <div class="warning">
              <strong>Important:</strong> This code will expire in 15 minutes. If you didn't request this password reset, please ignore this email.
            </div>
            
            <p>To reset your password:</p>
            <ol>
              <li>Go to the password reset page</li>
              <li>Enter your email address</li>
              <li>Enter the verification code above</li>
              <li>Create a new password</li>
            </ol>
            
            <p>If you have any questions, please contact our support team.</p>
            
            <p>Best regards,<br>The Scrapme Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Scrapme. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Scrapme - Password Reset Code

Hello ${userName},

You have requested to reset your password for your Scrapme account.

Your verification code is: ${resetCode}

This code will expire in 15 minutes. If you didn't request this password reset, please ignore this email.

To reset your password:
1. Go to the password reset page
2. Enter your email address
3. Enter the verification code above
4. Create a new password

If you have any questions, please contact our support team.

Best regards,
The Scrapme Team

This is an automated message. Please do not reply to this email.
    `;

    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Send request status update email
   * @param {string} to - Recipient email
   * @param {string} userName - User's name
   * @param {string} requestId - Request ID
   * @param {string} status - New status
   * @param {string} message - Optional message from admin
   * @returns {Promise<boolean>} - Success status
   */
  async sendStatusUpdateEmail(to, userName, requestId, status, message = '') {
    const statusMap = {
      'pending': 'Pending Review',
      'evaluated': 'Evaluated',
      'approved': 'Approved',
      'completed': 'Completed',
      'rejected': 'Rejected'
    };

    const subject = `Scrapme - Request #${requestId.substring(0, 8)} Status Update`;
    const statusText = statusMap[status] || status;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
          .status-pending { background: #ffc107; color: #856404; }
          .status-evaluated { background: #17a2b8; color: white; }
          .status-approved { background: #28a745; color: white; }
          .status-completed { background: #20c997; color: white; }
          .status-rejected { background: #dc3545; color: white; }
          .info-box { background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #667eea; margin: 15px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Scrapme</h1>
            <p>Request Status Update</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>The status of your phone sell request <strong>#${requestId.substring(0, 8)}</strong> has been updated.</p>
            
            <div class="info-box">
              <p><strong>New Status:</strong> <span class="status-badge status-${status}">${statusText}</span></p>
              <p><strong>Request ID:</strong> ${requestId}</p>
              <p><strong>Updated:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            ${message ? `<div class="info-box"><strong>Message from Admin:</strong><p>${message}</p></div>` : ''}
            
            <p>You can check the details of your request by logging into your Scrapme account.</p>
            
            <p>If you have any questions about this update, please contact our support team.</p>
            
            <p>Best regards,<br>The Scrapme Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Scrapme. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Scrapme - Request Status Update

Hello ${userName},

The status of your phone sell request #${requestId.substring(0, 8)} has been updated.

New Status: ${statusText}
Request ID: ${requestId}
Updated: ${new Date().toLocaleString()}

${message ? `Message from Admin: ${message}\n\n` : ''}
You can check the details of your request by logging into your Scrapme account.

If you have any questions about this update, please contact our support team.

Best regards,
The Scrapme Team

This is an automated message. Please do not reply to this email.
    `;

    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Generic email sending method
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content
   * @returns {Promise<boolean>} - Success status
   */
  async sendEmail(to, subject, text, html) {
    if (!this.enabled || !this.transporter) {
      console.log(`📧 [EMAIL DISABLED] Would send email to: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Text: ${text.substring(0, 100)}...`);
      return true; // Return true to simulate success in development
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@scrapme.com',
        to,
        subject,
        text,
        html
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${to}: ${info.messageId}`);
      if (process.env.EMAIL_HOST === 'smtp.ethereal.email') {
        console.log(`📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;