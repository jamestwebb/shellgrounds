// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Content pack registry and loader.

import { GENERATED_PACKS } from './registry.gen.js';

// The registry is generated from the packs/ directory by
// scripts/build-registry.mjs, so adding or importing a pack no longer means
// hand-editing this file. Both the browser bundle and the Netlify functions
// import it, and Vite's import.meta.glob only solves the browser half — hence a
// generated file of plain static imports, committed so deploying needs no
// extra step. Regenerate with:  node scripts/build-registry.mjs
// A directory pack's JSON is imported raw, so its `//` comment keys arrive in
// the object. A single-file pack has them stripped on load. That difference is
// invisible until something compares the two -- an export round trip, or a UI
// that iterates manifest keys -- and then it looks like data loss rather than
// what it is. Strip here, so a comment means exactly one thing in both shapes:
// a note for whoever opens the file, never a field.
const withoutComments = (value) => {
  if (Array.isArray(value)) return value.map(withoutComments);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof k === 'string' && k.startsWith('//')) continue;
      out[k] = withoutComments(v);
    }
    return out;
  }
  return value;
};

export const PACKS = Object.fromEntries(
  Object.entries(GENERATED_PACKS).map(([id, pack]) => [id, {
    ...pack,
    manifest: withoutComments(pack.manifest),
    challenges: withoutComments(pack.challenges),
    help: pack.help ? withoutComments(pack.help) : pack.help
  }])
);

export const DEFAULT_PACK_ID = 'forensics-cli-101';

// Which pack owns a challenge id. The server resolves the pack from the
// submitted id rather than from the session token, because the token's pack was
// fixed at registration and the browser had no way to change it — which made 67
// of the 97 challenges impossible to score.
//
// That only works while ids are globally unique, so a collision throws at
// import time. A duplicate would silently score a challenge against another
// pack's filesystem; failing to boot is much kinder than that.
export const CHALLENGE_INDEX = (() => {
  const index = new Map();
  for (const pack of Object.values(PACKS)) {
    for (const c of pack.challenges) {
      const existing = index.get(c.id);
      if (existing) {
        throw new Error(
          `Duplicate challenge id '${c.id}' in packs '${existing.id}' and '${pack.id}'. ` +
          'Challenge ids must be unique across all packs.'
        );
      }
      index.set(c.id, pack);
    }
  }
  return index;
})();

export function getPackForChallenge(challengeId) {
  return CHALLENGE_INDEX.get(challengeId) || null;
}

// Never index PACKS with a bare bracket on caller-supplied text. Every member
// of Object.prototype answers truthily: PACKS['constructor'] returned the Object
// constructor, and a session token minted with packId 'constructor' made
// /api/manifest throw for 72 hours.
export function hasPack(packId) {
  return typeof packId === 'string' && Object.prototype.hasOwnProperty.call(PACKS, packId);
}

// ── Which packs this deployment offers ──────────────────────────────────────
// ENABLED_PACKS lets a teacher run one course at a time instead of all three.
// It is read from two places because the pack list is needed in two: the
// Netlify functions read the environment directly, and the browser bundle gets
// the same value inlined by vite.config.js at build time.
//
// Unset, blank, or naming nothing that exists all mean "offer every pack". A
// site that shows a student an empty menu is a worse failure than one that
// ignores a typo, and the typo is announced in the build log either way.
function rawEnabledSetting() {
  if (typeof process !== 'undefined' && process.env && process.env.ENABLED_PACKS != null) {
    return process.env.ENABLED_PACKS;
  }
  if (typeof __ENABLED_PACKS__ !== 'undefined') return __ENABLED_PACKS__;
  return '';
}

let warnedAboutSetting = null;
export function enabledPackIds() {
  const asked = String(rawEnabledSetting() ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (asked.length === 0) return Object.keys(PACKS);

  const known = asked.filter(hasPack);
  if (known.length === 0) {
    const setting = asked.join(',');
    if (warnedAboutSetting !== setting) {
      warnedAboutSetting = setting;
      console.warn(
        `ENABLED_PACKS names no pack that exists (${setting}). Offering every pack instead. `
        + `Valid ids: ${Object.keys(PACKS).join(', ')}`
      );
    }
    return Object.keys(PACKS);
  }
  return known;
}

/** True when students of this deployment may see the pack at all. */
export function isPackEnabled(packId) {
  return hasPack(packId) && enabledPackIds().includes(packId);
}

/** The pack a student lands on. DEFAULT_PACK_ID unless it was switched off. */
export function defaultPackId() {
  const enabled = enabledPackIds();
  return enabled.includes(DEFAULT_PACK_ID) ? DEFAULT_PACK_ID : enabled[0];
}

// Takes an explicit id even when it is disabled, because the CLI and the
// validator must be able to check a pack the running site does not offer.
// Refusing a disabled pack is the job of the request handlers, not of loading.
export function getPack(packId = DEFAULT_PACK_ID) {
  return hasPack(packId) ? PACKS[packId] : PACKS[defaultPackId()];
}

export function listPacks() {
  return enabledPackIds().map(id => PACKS[id]).map(p => ({
    id: p.id,
    name: p.manifest.name,
    version: p.manifest.version,
    platforms: p.manifest.platforms,
    theme: p.manifest.theme,
    acts: p.manifest.acts,
    badges: p.manifest.badges
  }));
}
