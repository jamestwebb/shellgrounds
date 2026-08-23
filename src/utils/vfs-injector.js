// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Slices per-user flags into the virtual filesystem templates.
//
// This MUST run over the filesystem itself, not just over rendered output:
// commands operate on raw file content, so a VFS still holding `[[FLAG:id]]`
// makes `grep "FLAG{" file` find nothing while `cat file` appears correct.
// The server does the same thing in netlify/functions/submit-flag.js; if the
// two ever diverge, a challenge passes in the browser and is rejected on submit.

// Shown when the server manifest could not be loaded. Flags are only ever generated
// server-side (per-user HMAC); the client must never synthesize them locally.
export const FLAG_UNAVAILABLE = '[FLAG UNAVAILABLE — refresh the page to re-sync with HQ]';

/**
 * Injects user-specific flags into VFS file contents.
 * @param rawFs      filesystem from pack.createFs(platform)
 * @param handle     the student's handle (for [[FLAG:USER_HANDLE]])
 * @param serverFlags challengeId -> flag, from GET /api/manifest
 * @param challenges  the active pack's challenge list (for staticFlag lookup)
 */
export function injectFlagsIntoVFS(rawFs, handle, serverFlags = {}, challenges = []) {
  const flagMap = { ...serverFlags };
  for (const c of challenges) {
    if (c.success?.kind === 'flag' && !flagMap[c.id] && c.success.staticFlag) {
      flagMap[c.id] = c.success.staticFlag;
    }
  }

  const cloned = {};
  for (const [key, node] of Object.entries(rawFs)) {
    if (node && node.type === 'file' && typeof node.content === 'string') {
      cloned[key] = { ...node, content: replaceFlagTokens(node.content, flagMap, handle) };
    } else {
      cloned[key] = node;
    }
  }
  return { fs: cloned, flagMap };
}

/**
 * Replaces [[FLAG:id]] tokens in any text (file contents or command output).
 * Tokens with no known flag become an explicit "unavailable" marker rather than
 * leaking the raw placeholder to the student.
 */
export function replaceFlagTokens(text, flagMap = {}, handle = null) {
  if (!text || !text.includes('[[FLAG:')) return text;
  let updated = text;
  for (const [cId, flagValue] of Object.entries(flagMap)) {
    updated = updated.replaceAll(`[[FLAG:${cId}]]`, flagValue);
  }
  if (handle) updated = updated.replaceAll('[[FLAG:USER_HANDLE]]', handle);
  return updated.replace(/\[\[FLAG:[a-zA-Z0-9_-]+\]\]/g, FLAG_UNAVAILABLE);
}
