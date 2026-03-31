const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require('dotenv').config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // Default 10MB
const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES || 'application/pdf,image/jpeg,image/png').split(',');
const ALLOWED_EXTENSIONS = (process.env.ALLOWED_EXTENSIONS || '.pdf,.jpg,.jpeg,.png').split(',');

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
        if (size > MAX_FILE_SIZE) {
            console.warn(`[STORAGE_VALIDATION] File too large: ${size} bytes`);
            return false;
        }
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
            console.warn(`[STORAGE_VALIDATION] Unsupported MIME: ${mimeType}`);
            return false;
        }
        const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
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
        if (!BUCKET_NAME) throw new Error("AWS_S3_BUCKET not configured");

        console.log(`[S3_UPLOAD] Starting upload: ${key} (${buffer.length} bytes)`);
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType
        });

        try {
            await s3Client.send(command);
            console.log(`[S3_UPLOAD] Success: ${key}`);
            return key;
        } catch (err) {
            console.error(`[S3_UPLOAD] Failed: ${key} | Error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Deletes a file from S3
     * @param {string} key 
     */
    async deleteFile(key) {
        if (!BUCKET_NAME) return;
        console.log(`[S3_DELETE] Attempting deletion: ${key}`);
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        try {
            await s3Client.send(command);
            console.log(`[S3_DELETE] Success: ${key}`);
        } catch (err) {
            console.error(`[S3_DELETE] Failed: ${key} | Error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Generates a signed URL for reading a private S3 object
     * @param {string} key 
     * @param {number} expiresIn - Seconds
     * @returns {Promise<string>}
     */
    async getSignedDownloadUrl(key, expiresIn = 3600) {
        if (!BUCKET_NAME) throw new Error("AWS_S3_BUCKET not configured");
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        return await getSignedUrl(s3Client, command, { expiresIn });
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
        if (!BUCKET_NAME) throw new Error("AWS_S3_BUCKET not configured");
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        const response = await s3Client.send(command);
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

module.exports = new StorageService();
