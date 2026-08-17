import { describe, it, expect } from 'vitest';
import {
  generateUserFlag,
  createSessionToken,
  verifySessionToken,
  md5,
  sha256Sync
} from '../src/engine/crypto-utils.js';

describe('Crypto Utilities', () => {
  const secret = 'test-secret-salt-123';

  it('generates consistent per-user flags', () => {
    const flag1 = generateUserFlag(secret, 'analyst_alice', 'act1-hidden');
    const flag2 = generateUserFlag(secret, 'analyst_alice', 'act1-hidden');
    const flag3 = generateUserFlag(secret, 'analyst_bob', 'act1-hidden');

    expect(flag1).toMatch(/^FLAG\{[A-Z2-7]{12}\}$/);
    expect(flag1).toBe(flag2);
    expect(flag1).not.toBe(flag3); // Different users get different flags
  });

  it('creates and verifies valid session tokens', () => {
    const token = createSessionToken(secret, 'ghost_tanaka', 24);
    const verified = verifySessionToken(secret, token);

    expect(verified).not.toBeNull();
    expect(verified.handle).toBe('ghost_tanaka');
  });

  it('rejects tampered session tokens', () => {
    const token = createSessionToken(secret, 'ghost_tanaka', 24);
    const tampered = token.slice(0, -4) + 'AAAA';
    const verified = verifySessionToken(secret, tampered);

    expect(verified).toBeNull();
  });

  it('computes accurate MD5 and SHA-256 digests', () => {
    const text = 'White Rabbit Forensics 2026';
    const md5Hash = md5(text);
    const shaHash = sha256Sync(text);

    expect(md5Hash).toHaveLength(32);
    expect(shaHash).toHaveLength(64);
  });
});
