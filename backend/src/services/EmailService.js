const axios = require("axios");

/**
 * 📧 Email Service (BREVO MIGRATION - PRODUCTION READY)
 * Responsibility: Delivery of transactional notifications.
 * Pattern: API-based dispatch with process.env validation.
 */
class EmailService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.senderEmail = process.env.EMAIL_FROM || "no-reply@bbsns.online";
    this.senderName = process.env.EMAIL_FROM_NAME || "BBSNS";
    this.apiUrl = "https://api.brevo.com/v3/smtp/email";
    
    // 🛡️ [RUNTIME_AUDIT] Ensure critical keys exist
    if (!this.apiKey && process.env.NODE_ENV === "production") {
      console.warn("⚠️ [EMAIL_WARN] BREVO_API_KEY is missing in production. Email delivery will fail.");
    }
  }

  /**
   * 📧 sendActivationEmail
   * Triggers the notary onboarding link to users.
   */
  async sendActivationEmail(to, token) {
    const authUrl = process.env.REMOTE_AUTH_URL || "https://auth.bbsns.online";
    const activationLink = `${authUrl}/?mode=activate&token=${token}`;

    const emailData = {
      sender: {
        name: this.senderName,
        email: this.senderEmail
      },
      to: [{ email: to }],
      subject: "BBSNS Notary Activation",
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1f2937;">BBSNS Notary Activation</h2>
          <p style="color: #4b5563;">Your notary application has been approved. Please click the button below to activate your account and set up your profile.</p>
          <div style="margin: 30px 0;">
            <a href="${activationLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activate Account</a>
          </div>
          <p style="color: #6b7280; font-size: 0.875rem;">This link will expire in 30 minutes for security purposes.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 0.75rem;">If you did not apply for a notary account on BBSNS, please ignore this email.</p>
        </div>
      `
    };

    try {
      const response = await axios.post(this.apiUrl, emailData, {
        headers: {
          "api-key": this.apiKey,
          "content-type": "application/json",
          "accept": "application/json"
        }
      });

      console.log("✅ [EMAIL_SUCCESS] Brevo dispatch complete:", {
        to,
        messageId: response.data.messageId
      });
      
      return { success: true, messageId: response.data.messageId };
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      console.error("❌ [EMAIL_FAILURE] Brevo API error:", {
        to,
        error: errorMsg,
        code: error.response?.data?.code
      });
      
      return { success: false, error: errorMsg };
    }
  }
  async sendRejectionEmail(to) {
    const emailData = {
      sender: {
        name: this.senderName,
        email: this.senderEmail
      },
      to: [{ email: to }],
      subject: "BBSNS Notary Application Update",
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1f2937;">Notary Application Update</h2>
          <p style="color: #4b5563;">Thank you for your interest in becoming a notary on BBSNS.</p>
          <p style="color: #4b5563;">After careful review, we are unable to approve your application at this time.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 0.75rem;">If you have any questions, please contact our support team.</p>
        </div>
      `
    };

    try {
      const response = await axios.post(this.apiUrl, emailData, {
        headers: {
          "api-key": this.apiKey,
          "content-type": "application/json",
          "accept": "application/json"
        }
      });
      return { success: true, messageId: response.data.messageId };
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      return { success: false, error: errorMsg };
    }
  }
}

module.exports = new EmailService();
