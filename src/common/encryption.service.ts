import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * EncryptionService — AES-256-GCM encryption for PII fields
 *
 * Two modes:
 * - encrypt/decrypt: uses random IV (secure, for fields like address)
 * - encryptDeterministic/decrypt: uses HMAC-derived IV (searchable, for email/phone unique keys)
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly ivLength = 12; // 96-bit IV recommended for GCM

  constructor() {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    // Derive a 32-byte key using SHA-256 hash of the env key
    this.key = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypt with a random IV — use for fields that don't need to be searchable (e.g., address).
   * Format: "iv:authTag:ciphertext" (all hex)
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Encrypt with a deterministic IV derived from HMAC(key, value).
   * Use for fields that need to be unique-indexed and searchable (email, phone).
   * The same plaintext always produces the same ciphertext → can be used in WHERE queries.
   */
  encryptDeterministic(plaintext: string): string {
    if (!plaintext) return plaintext;
    // Derive a deterministic 12-byte IV from HMAC-SHA256 of the plaintext
    const hmac = crypto.createHmac('sha256', this.key);
    hmac.update(plaintext.toLowerCase().trim()); // normalize before hashing
    const iv = hmac.digest().subarray(0, this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext.toLowerCase().trim(), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt either mode — format is identical.
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;
    // If not encrypted (legacy plaintext or no ':' separator), return as-is
    if (!encryptedText.includes(':')) return encryptedText;

    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;

    try {
      const [ivHex, authTagHex, ciphertextHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      // If decryption fails (e.g., legacy plaintext stored), return original
      return encryptedText;
    }
  }

  /**
   * Check if a value is already encrypted (has our format)
   */
  isEncrypted(value: string): boolean {
    if (!value) return false;
    const parts = value.split(':');
    return parts.length === 3 && parts[0].length === 24; // 12 bytes = 24 hex chars
  }
}
