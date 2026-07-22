import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../env.js';

/**
 * Field-level encryption for CRITICAL data (Plan §13): Aadhaar/national IDs,
 * bank details, etc. AES-256-GCM with a PER-TENANT key derived from the master
 * key via HKDF(masterKey, salt=tenantId). Even a DB dump is useless without the
 * master key, and one tenant's key never decrypts another's data.
 *
 * Production upgrade path: swap deriveKey() to fetch per-tenant keys from
 * Vault/KMS — call sites and stored format stay identical.
 *
 * Stored format: "v1:<iv_b64>:<ciphertext_b64>:<authTag_b64>"
 */
const VERSION = 'v1';

function masterKey(): Buffer {
  // 32-byte key, base64. Dev default is obviously not for production.
  const raw = env.FIELD_ENCRYPTION_KEY;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  }
  return key;
}

function deriveKey(tenantId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterKey(), Buffer.from(tenantId), Buffer.from('field-encryption'), 32),
  );
}

export function encryptField(plaintext: string, tenantId: string): string {
  const key = deriveKey(tenantId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

export function decryptField(stored: string, tenantId: string): string {
  const [version, ivB64, ctB64, tagB64] = stored.split(':');
  if (version !== VERSION || !ivB64 || !ctB64 || !tagB64) {
    throw new Error('Malformed encrypted field');
  }
  const key = deriveKey(tenantId);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

/** Last-4 masking for display when the caller lacks decrypt permission. */
export function maskId(plaintext: string): string {
  const digits = plaintext.replace(/\s/g, '');
  return digits.length <= 4 ? '••••' : `••••••••${digits.slice(-4)}`;
}
