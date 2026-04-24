// AES-256-GCM encrypt/decrypt for SMTP passwords stored in the database.
//
// Requires env var: SMTP_ENCRYPTION_KEY — a 32-byte (64-char hex) key.
// Generate with: openssl rand -hex 32
//
// Stored format: <iv_base64>:<authTag_base64>:<ciphertext_base64>

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
    const hex = process.env.SMTP_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            'SMTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
            'Generate with: openssl rand -hex 32'
        );
    }
    return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext SMTP password for storage.
 * Returns a string in the format: iv:authTag:ciphertext (all base64).
 */
export function encryptSmtpPassword(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
}

/**
 * Decrypt a stored SMTP password.
 * Accepts the format returned by encryptSmtpPassword.
 */
export function decryptSmtpPassword(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted password format');
    }
    const [ivB64, authTagB64, ciphertextB64] = parts;

    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
