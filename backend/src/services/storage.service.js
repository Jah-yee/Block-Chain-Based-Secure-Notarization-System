const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require('dotenv').config();

let _s3Client = null;
let _bucketName = null;

/**
 * 🛡️ STORAGE_INIT (PHASE 3 - HARDENED BOOT)
 * Responsibility: Manual, one-time initialization of S3 client.
 * Note: Uses IAM Instance Profile by default (no explicit creds required).
 */
const init = () => {
    if (_s3Client) return;

    _bucketName = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || 'ap-south-1';

    _s3Client = new S3Client({ region });
    console.log(`   ✅ StorageService: Initialized for region [${region}] and bucket [${_bucketName || 'PENDING'}]`);
};

// Internal getters to ensure access happens after init
const getClient = () => {
    if (!_s3Client) throw new Error("❌ [STORAGE_FATAL] S3 Client used before initialization.");
    return _s3Client;
};

const getBucket = () => {
    if (!_bucketName) throw new Error("❌ [STORAGE_FATAL] AWS_S3_BUCKET is missing after handshake.");
    return _bucketName;
};

const MAX_FILE_SIZE = () => parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB Standard
const ALLOWED_MIME_TYPES = () => (process.env.ALLOWED_MIME_TYPES || 'application/pdf,image/jpeg,image/png').split(',');
const ALLOWED_EXTENSIONS = () => (process.env.ALLOWED_EXTENSIONS || '.pdf,.jpg,.jpeg,.png').split(',');

/**
 * Storage Service
 * Abstracts cloud storage operations (S3)
 */
class StorageService {
    /**
     * Validates file size, MIME type, and extension
     * @param {number} size 
     * @param {string} mimeType 
     * @param {string} filename 
     * @returns {boolean}
     */
    validateFile(size, mimeType, filename) {
        if (size > MAX_FILE_SIZE()) {
            console.warn(`[STORAGE_VALIDATION] File too large: ${size} bytes (Limit: ${MAX_FILE_SIZE()})`);
            return false;
        }
        if (!ALLOWED_MIME_TYPES().includes(mimeType)) {
            console.warn(`[STORAGE_VALIDATION] Unsupported MIME: ${mimeType}`);
            return false;
        }
        const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        if (!ALLOWED_EXTENSIONS().includes(ext)) {
            console.warn(`[STORAGE_VALIDATION] Unsupported Extension: ${ext}`);
            return false;
        }
        return true;
    }

    /**
     * Uploads a file buffer to S3
     * @param {Buffer} buffer 
     * @param {string} key - S3 object key (path)
     * @param {string} contentType 
     * @returns {Promise<string>} - The S3 object key or URL
     */
    async uploadFile(buffer, key, contentType) {
        const bucket = getBucket();
        const client = getClient();

        console.log(`[S3_UPLOAD] Starting upload: ${key} (${buffer.length} bytes)`);
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType
        });

        try {
            await client.send(command);
            console.log(`[S3_UPLOAD] S3 UPLOAD SUCCESS: ${key}`);
            return key;
        } catch (err) {
            console.error(`[S3_UPLOAD] S3 UPLOAD FAILED: ${key} | Error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Deletes a file from S3
     * @param {string} key 
     */
    async deleteFile(key) {
        console.log(`[S3_DELETE] Attempting deletion: ${key}`);
        const command = new DeleteObjectCommand({
            Bucket: getBucket(),
            Key: key
        });
        try {
            await getClient().send(command);
            console.log(`[S3_DELETE] Success: ${key}`);
        } catch (err) {
            console.error(`[S3_DELETE] Failed: ${key} | Error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Generates a signed URL for reading a private S3 object
     * @param {string} key 
     * @param {object} options - { expiresIn, disposition, filename, contentType }
     * @returns {Promise<string>}
     */
    async getSignedDownloadUrl(key, options = {}) {
        const { 
            expiresIn = 120, // 120s Production Hardened Default
            disposition = 'attachment',
            filename,
            contentType
        } = options;

        const params = {
            Bucket: getBucket(),
            Key: key,
            ResponseContentDisposition: filename 
                ? `${disposition}; filename="${filename.replace(/"/g, '')}"`
                : disposition,
            ResponseContentType: contentType || 'application/octet-stream'
        };

        const command = new GetObjectCommand(params);
        return await getSignedUrl(getClient(), command, { expiresIn });
    }

    /**
     * Returns a public URL for an S3 object (assumes bucket is public-read)
     * @param {string} key 
     * @returns {string}
     */
    /**
     * Retrieves a file buffer from S3
     * @param {string} key 
     * @returns {Promise<Buffer>}
     */
    async getFileBuffer(key) {
        const command = new GetObjectCommand({
            Bucket: getBucket(),
            Key: key
        });
        const response = await getClient().send(command);
        const streamToBuffer = (stream) =>
            new Promise((resolve, reject) => {
                const chunks = [];
                stream.on("data", (chunk) => chunks.push(chunk));
                stream.on("error", reject);
                stream.on("end", () => resolve(Buffer.concat(chunks)));
            });
        return await streamToBuffer(response.Body);
    }
}

// Instantiate the singleton service
const storageService = new StorageService();

// Attach the init method to the instance for system-wide bootstrapping
storageService.init = init;

// Export ONLY the usable instance to resolve previous TypeErrors
module.exports = storageService;
