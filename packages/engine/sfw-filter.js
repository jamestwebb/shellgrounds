// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// SFW filter and validation rules for handles in The Gauntlet

export const BLOCKED_WORDS = [
  'fuck', 'shit', 'ass', 'damn', 'hell', 'bitch', 'bastard', 'crap', 'piss',
  'cock', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'fag', 'nigger', 'nigga',
  'retard', 'spic', 'chink', 'kike', 'dyke', 'twat', 'wanker', 'bollocks',
  'f4ck', 'fck', 'fuk', 'fuq', 'sh1t', 'sht', 'a55', 'b1tch', 'd1ck', 'p1ss',
  'cocaine', 'heroin', 'meth', 'crack',
  'kill', 'murder', 'rape', 'terrorist',
  'porn', 'xxx', 'sex', 'nude', 'naked',
  'nazi', 'hitler', 'kkk', 'isis',
];

export const BLOCKED_PATTERNS = [
  { pattern: /(.)\1{3,}/, reason: 'Too many repeated characters' },
  { pattern: /^[0-9]+$/, reason: 'Handle cannot be purely numbers' },
  { pattern: /admin/i, reason: 'Handle cannot contain reserved term "admin"' },
  { pattern: /moderator/i, reason: 'Handle cannot contain reserved term "moderator"' },
  { pattern: /staff/i, reason: 'Handle cannot contain reserved term "staff"' },
  { pattern: /system/i, reason: 'Handle cannot contain reserved term "system"' },
  { pattern: /support/i, reason: 'Handle cannot contain reserved term "support"' },
  { pattern: /official/i, reason: 'Handle cannot contain reserved term "official"' },
  { pattern: /root/i, reason: 'Handle cannot contain reserved term "root"' },
];

export const checkSFW = (text) => {
  if (!text || typeof text !== 'string') {
    return { safe: false, reason: 'Handle is required' };
  }

  const trimmed = text.trim();

  if (trimmed.length < 3) {
    return { safe: false, reason: 'Handle must be at least 3 characters' };
  }

  if (trimmed.length > 20) {
    return { safe: false, reason: 'Handle must be 20 characters or less' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { safe: false, reason: 'Only letters, numbers, underscores, and hyphens allowed' };
  }

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const word of BLOCKED_WORDS) {
    const cleanWord = word.replace(/[^a-z0-9]/g, '');
    if (normalized.includes(cleanWord)) {
      return { safe: false, reason: 'Contains inappropriate content' };
    }
  }

  for (const item of BLOCKED_PATTERNS) {
    if (item.pattern.test(trimmed)) {
      return { safe: false, reason: item.reason };
    }
  }

  return { safe: true, handle: trimmed };
};
