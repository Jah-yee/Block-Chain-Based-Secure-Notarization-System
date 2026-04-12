const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

/**
 * 🛡️ [Hardening 2.9C-A] Production-Grade Email Authority (AWS SES)
 * Decouples communication logic from business flows and ensures security via IAM-managed credentials.
 */
class EmailService {
  constructor() {
    this.client = new SESClient({
      region: process.env.AWS_REGION || "ap-south-1",
    });
    this.sender = "no-reply@bbsns.online";
  }

  /**
   * sendActivationEmail: Dispatches secure onboarding links
   * @param {string} to - Recipient email
   * @param {string} token - Cryptographic activation token
   */
  async sendActivationEmail(to, token) {
    const activationLink = `https://bbsns.online/activate?token=${token}`;
    
    const params = {
      Source: this.sender,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: "BBSNS Notary Activation",
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #2563eb;">BBSNS Notary Activation</h2>
                <p>Your account has been approved.</p>
                <p>Click the button below to activate your account and set your secure password:</p>
                <div style="margin: 30px 0;">
                  <a href="${activationLink}" 
                     style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    Activate Account
                  </a>
                </div>
                <p style="color: #666; font-size: 12px;">This link will expire in 30 minutes.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="color: #999; font-size: 10px;">If you did not request this, please ignore this email.</p>
              </div>
            `,
            Charset: "UTF-8",
          },
        },
      },
    };

    try {
      const command = new SendEmailCommand(params);
      const response = await this.client.send(command);
      console.log(`[EMAIL_SERVICE] Activation sent to ${to} | MessageId: ${response.MessageId}`);
      return { success: true, messageId: response.MessageId };
    } catch (err) {
      console.error(`[EMAIL_SERVICE_ERROR] Failed to send to ${to} | Detail: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new EmailService();
