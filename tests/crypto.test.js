// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Cryptographic Utility Tests

import { describe, it, expect } from 'vitest';
import {
  generateUserFlag,
  createSessionToken,
  verifySessionToken,
  md5,
  sha256Sync,
  toBase32
} from '../packages/engine/crypto-utils.js';

describe('Cryptographic Engine & Session Integrity', () => {
  const SECRET = 'test-secret-key-1234567890';
  const HANDLE = 'student_01';

  it('generates deterministic user flags matching FLAG{...} format', () => {
    const flag1 = generateUserFlag(SECRET, HANDLE, 'act1-cd', 'forensics-cli-101');
    const flag2 = generateUserFlag(SECRET, HANDLE, 'act1-cd', 'forensics-cli-101');
    expect(flag1).toBe(flag2);
    expect(flag1).toMatch(/^FLAG\{[A-Z2-7]{12}\}$/);

    // Different challenge gets different flag
    const flag3 = generateUserFlag(SECRET, HANDLE, 'act1-hidden', 'forensics-cli-101');
    expect(flag3).not.toBe(flag1);

    // Different handle gets different flag
    const flag4 = generateUserFlag(SECRET, 'student_02', 'act1-cd', 'forensics-cli-101');
    expect(flag4).not.toBe(flag1);
  });

  it('creates and verifies pack-aware HMAC session tokens', () => {
    const token = createSessionToken(SECRET, HANDLE, 'forensics-cli-101');
    expect(token).toBeDefined();

    const verified = verifySessionToken(SECRET, token);
    expect(verified).not.toBeNull();
    expect(verified.handle).toBe(HANDLE);
    expect(verified.packId).toBe('forensics-cli-101');
  });

  it('rejects tampered or expired tokens', () => {
    const token = createSessionToken(SECRET, HANDLE, 'forensics-cli-101');
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(verifySessionToken(SECRET, tampered)).toBeNull();
    expect(verifySessionToken('wrong-secret', token)).toBeNull();
  });

  it('computes accurate MD5 and SHA-256 hashes', () => {
    expect(md5('hello\n')).toBe('b1946ac92492d2347c6235b4d2611184');
    expect(sha256Sync('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
