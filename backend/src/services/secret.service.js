const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

/**
 * 🛡️ SECRET SERVICE (PHASE 2 - CLOUD-NATIVE HARDENING)
 * Responsibility: Secure, asynchronous fetching of high-risk runtime secrets from AWS.
 * Logic:
 * - Production: Fetches from AWS Secrets Manager using IAM Role IRSA/InstanceProfile.
 * - Development: Falls back to local .env for developer efficiency.
 */
class SecretService {
  constructor() {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || "ap-south-1"
    });
    this.secretName = process.env.AWS_SECRET_NAME || "bbsns/prod/secrets";
    this.isLoaded = false;
  }

  /**
   * 🛡️ loadSecrets() - BOOTSTRAP ANCHOR
   * Must be called before ANY other service or DB pool is initialized.
   */
  async loadSecrets() {
    // 1. Skip if already loaded or in non-production test mode (handled by .env)
    if (this.isLoaded) return;
    
    const isProduction = process.env.NODE_ENV === "production" || process.env.CHAIN_ID === "97";
    
    if (!isProduction) {
      console.log("   - 🛡️ SecretService: Local Node mode detected. Skipping AWS vault fetch.");
      this.isLoaded = true;
      return;
    }

    console.log(`   - 🛡️ SecretService: Fetching authoritative secrets from [${this.secretName}]...`);

    try {
      const response = await this.client.send(
        new GetSecretValueCommand({
          SecretId: this.secretName,
        })
      );

      if (response.SecretString) {
        const secrets = JSON.parse(response.SecretString);
        
        // 🛡️ [INJECTION] Overwrite process.env with vaulted secrets
        Object.keys(secrets).forEach(key => {
          process.env[key] = secrets[key];
        });

        console.log("   ✅ SecretService: Remote vault handshake successful. Keys injected.");
        this.isLoaded = true;
      } else {
        throw new Error("Secret exists but contains no SecretString payload.");
      }
    } catch (err) {
      console.error(`❌ [SECRET_FATAL] Failed to fetch secrets from AWS: ${err.message}`);
      
      // In production, we FAIL CLOSED if the vault is unreachable.
      if (isProduction) {
         console.error("👉 ACTION REQUIRED: Verify EC2 IAM Role has 'secretsmanager:GetSecretValue' permissions.");
         process.exit(1);
      }
    }
  }
}

module.exports = new SecretService();
