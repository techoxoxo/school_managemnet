import { describe, expect, it } from 'vitest';
import { decryptField, encryptField, maskId } from './encryption.js';

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';

describe('field encryption (P1-MOD-11)', () => {
  it('round-trips a value within the same tenant', () => {
    const enc = encryptField('123456789012', T1);
    expect(enc).not.toContain('123456789012');
    expect(decryptField(enc, T1)).toBe('123456789012');
  });

  it('produces different ciphertext each call (random IV)', () => {
    expect(encryptField('same', T1)).not.toBe(encryptField('same', T1));
  });

  it("one tenant's key cannot decrypt another tenant's data", () => {
    const enc = encryptField('secret-id', T1);
    expect(() => decryptField(enc, T2)).toThrow();
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const enc = encryptField('tamper-me', T1);
    const parts = enc.split(':');
    parts[2] = Buffer.from('evil-payload').toString('base64');
    expect(() => decryptField(parts.join(':'), T1)).toThrow();
  });

  it('masks to last 4 digits', () => {
    expect(maskId('123456789012')).toBe('••••••••9012');
    expect(maskId('12')).toBe('••••');
  });
});
