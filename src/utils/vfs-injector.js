// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Slices per-user flags into the virtual filesystem templates

import { CHALLENGES } from '../data/challenges.js';

// Shown when the server manifest could not be loaded. Flags are only ever generated
// server-side (per-user HMAC); the client must never synthesize them locally.
export const FLAG_UNAVAILABLE = '[FLAG UNAVAILABLE — refresh the page to re-sync with HQ]';

/**
 * Injects user-specific flags into the VFS file contents.
 * serverFlags comes from GET /api/manifest and is the only source of per-user flags.
 */
export function injectFlagsIntoVFS(rawFs, handle, serverFlags = {}) {
  const cloned = JSON.parse(JSON.stringify(rawFs));

  // Build map of challengeId -> flag
  const flagMap = {};
  CHALLENGES.forEach(c => {
    if (c.success?.kind === 'flag') {
      if (serverFlags[c.id]) {
        flagMap[c.id] = serverFlags[c.id];
      } else if (c.success.staticFlag) {
        flagMap[c.id] = c.success.staticFlag;
      }
    }
  });

  // Iterate over all VFS files and replace [[FLAG:id]] tokens
  for (const [, node] of Object.entries(cloned)) {
    if (node.type === 'file' && typeof node.content === 'string') {
      node.content = replaceFlagTokens(node.content, flagMap);
    }
  }

  return { fs: cloned, flagMap };
}

/**
 * Replaces [[FLAG:id]] tokens in any text (file contents or command output).
 * Tokens with no known flag become an explicit "unavailable" marker rather than
 * leaking the raw placeholder.
 */
export function replaceFlagTokens(text, flagMap) {
  if (!text || !text.includes('[[FLAG:')) return text;
  let updated = text;
  for (const [cId, flagValue] of Object.entries(flagMap)) {
    updated = updated.replaceAll(`[[FLAG:${cId}]]`, flagValue);
  }
  return updated.replace(/\[\[FLAG:[a-zA-Z0-9_-]+\]\]/g, FLAG_UNAVAILABLE);
}
