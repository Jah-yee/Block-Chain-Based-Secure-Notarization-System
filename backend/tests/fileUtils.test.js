const { computeFileHash, verifyFileHash } = require('../src/utils/fileUtils');
const fs = require('fs');
const path = require('path');

describe('File Hash Utility', () => {
    const testDir = path.join(__dirname, 'test-files');
    const testFile1 = path.join(testDir, 'test1.txt');
    const testFile2 = path.join(testDir, 'test2.txt');

    beforeAll(() => {
        // Create test directory and files
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        fs.writeFileSync(testFile1, 'test content');
        fs.writeFileSync(testFile2, 'test content'); // Same content
    });

    afterAll(() => {
        // Cleanup
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('computeFileHash', () => {
        it('should compute hash from file path', () => {
            const hash = computeFileHash(testFile1);
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
        });

        it('should compute hash from buffer', () => {
            const buffer = Buffer.from('test content');
            const hash = computeFileHash(buffer);
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
        });

        it('should produce same hash for same content', () => {
            const hash1 = computeFileHash(testFile1);
            const hash2 = computeFileHash(testFile2);
            expect(hash1).toBe(hash2);
        });

        it('should produce different hash for different content', () => {
            const hash1 = computeFileHash(Buffer.from('content A'));
            const hash2 = computeFileHash(Buffer.from('content B'));
            expect(hash1).not.toBe(hash2);
        });

        it('should produce deterministic hash', () => {
            const buffer = Buffer.from('deterministic test');
            const hash1 = computeFileHash(buffer);
            const hash2 = computeFileHash(buffer);
            const hash3 = computeFileHash(buffer);
            expect(hash1).toBe(hash2);
            expect(hash2).toBe(hash3);
        });

        it('should throw error for invalid input', () => {
            expect(() => computeFileHash(123)).toThrow();
            expect(() => computeFileHash(null)).toThrow();
            expect(() => computeFileHash(undefined)).toThrow();
        });
    });

    describe('verifyFileHash', () => {
        it('should verify correct hash', () => {
            const buffer = Buffer.from('test content');
            const hash = computeFileHash(buffer);
            expect(verifyFileHash(buffer, hash)).toBe(true);
        });

        it('should reject incorrect hash', () => {
            const buffer = Buffer.from('test content');
            const wrongHash = '0x' + '0'.repeat(64);
            expect(verifyFileHash(buffer, wrongHash)).toBe(false);
        });

        it('should handle hash with or without 0x prefix', () => {
            const buffer = Buffer.from('test content');
            const hash = computeFileHash(buffer);
            const hashWithout0x = hash.substring(2);

            expect(verifyFileHash(buffer, hash)).toBe(true);
            expect(verifyFileHash(buffer, hashWithout0x)).toBe(true);
        });

        it('should be case-insensitive', () => {
            const buffer = Buffer.from('test content');
            const hash = computeFileHash(buffer);
            const upperHash = hash.toUpperCase();
            const lowerHash = hash.toLowerCase();

            expect(verifyFileHash(buffer, upperHash)).toBe(true);
            expect(verifyFileHash(buffer, lowerHash)).toBe(true);
        });
    });

    describe('Hash Authority - Security Tests', () => {
        it('should compute consistent hash for PDF-like content', () => {
            const pdfContent = Buffer.from('%PDF-1.4\ntest document content');
            const hash1 = computeFileHash(pdfContent);
            const hash2 = computeFileHash(pdfContent);
            expect(hash1).toBe(hash2);
        });

        it('should detect even single byte difference', () => {
            const content1 = Buffer.from('document content');
            const content2 = Buffer.from('document Content'); // Capital C
            const hash1 = computeFileHash(content1);
            const hash2 = computeFileHash(content2);
            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty file', () => {
            const emptyBuffer = Buffer.from('');
            const hash = computeFileHash(emptyBuffer);
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
        });

        it('should handle large file simulation', () => {
            // Simulate 1MB file
            const largeBuffer = Buffer.alloc(1024 * 1024, 'a');
            const hash = computeFileHash(largeBuffer);
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
        });
    });

    describe('Known Hash Verification', () => {
        it('should match known SHA-256 hash', () => {
            // "test content" should produce this specific hash
            const buffer = Buffer.from('test content');
            const hash = computeFileHash(buffer);

            // Verify it's a valid hash format
            expect(hash).toMatch(/^0x[a-f0-9]{64}$/);

            // Compute expected hash manually
            const crypto = require('crypto');
            const expectedHash = '0x' + crypto.createHash('sha256').update('test content').digest('hex');

            expect(hash).toBe(expectedHash);
        });
    });
});
